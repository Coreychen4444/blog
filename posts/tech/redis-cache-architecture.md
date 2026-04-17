---
title: "Building a 7-Layer Redis Cache Architecture"
topic: "tech"
type: "case-note"
status: "published"
date: "2026-02-20"
excerpt: "How we designed a multi-layer Redis caching strategy for our user service — from bloom filters to pipeline-batched operations."
tags: ["Redis", "Architecture", "Caching", "Go"]
readTime: 12
featured: true
---

Caching is not just about putting data in Redis. A well-designed cache architecture has to answer invalidation, stampede prevention, cross-service consistency, and the occasional 3 AM page when the hit rate falls off a cliff. After three rewrites, the user service I work on settled into what internally we just call the "7 layers" — a set of caches that sit in front of MySQL and shoulder roughly 94% of the read traffic.

This is the post-mortem version: the 7 layers, why each one exists, the tradeoffs we made, and the patterns I'd reach for again on a new service.

## Context

The user service handles millions of requests daily: login, profile lookup, credit quota checks, VIP tier evaluation, security token issuance. Every upstream service hits us. If we're slow, the whole platform is slow. If we cache wrong, users see someone else's balance. The bar is "fast and correct," in that order.

MySQL alone can't hold the read rate. Straight key-value caching isn't enough either — different access patterns want different shapes. So rather than one monolithic cache, we built layers that each solve one problem.

## The 7 Layers

### 1. User Info Cache — The Workhorse

Hot-path user profiles (`user:{id}`) stored as Redis Hashes. Keyed lookup, 1ms P99. Populated on first read (lazy load), invalidated on write.

```go
func (r *UserRepo) Get(ctx context.Context, id int64) (*User, error) {
    key := fmt.Sprintf("user:%d", id)
    if u, ok := r.getFromCache(ctx, key); ok {
        return u, nil
    }
    u, err := r.loadFromDB(ctx, id)
    if err != nil { return nil, err }
    r.setCache(ctx, key, u, ttlWithJitter(10*time.Minute))
    return u, nil
}
```

TTL is 10 minutes with ±30s jitter. Invalidation on write is the usual `DEL` after the DB commit succeeds — we accept a very small inconsistency window over the complexity of distributed locking.

### 2. Login Token Cache — Session State

Auth tokens map to a session payload (userID, tenantID, scopes, issued-at). Lookup is every authenticated request, so it has to be fast and it has to be correct. We use Redis with a TTL that matches the token lifetime plus a small grace window.

One subtle thing: token *revocation* needs to be instant (user logged out → reuse of the token must fail). We keep a separate `revoked:{jti}` set with short TTL (until the token would have expired anyway). Check order: if `revoked` exists, reject; otherwise trust the cache.

### 3. Credit Quota Cache — With Atomic Ops

Credit quotas are read on every spend operation and written often. Naive caching breaks here because two spend operations racing on the same cached integer will double-count.

We use Redis `INCRBY` with a negative delta instead:

```go
remaining := redis.IncrBy(ctx, key, -amount)
if remaining < 0 {
    redis.IncrBy(ctx, key, amount) // roll back
    return ErrInsufficientCredit
}
```

Atomic, no distributed lock, no race. Periodic reconciliation with MySQL catches drift (every 5 minutes a sweeper job rewrites the cache from the DB).

### 4. Security Token Cache — Hot, Short-Lived

Security tokens (2FA, email confirmation, password reset) live in Redis only — they're short-lived enough that we don't bother persisting them to MySQL. Stored as strings with a TTL matching the token's validity. This layer lives in a separate Redis cluster from the others because its write rate is spiky (password reset storms during incidents) and we want the blast radius contained.

### 5. Bloom Filter — Account Deduplication

The one that saves us the most. When an upstream service asks "does user X exist?", the naive answer is a DB lookup. For usernames that *don't* exist (typos, bots scanning for accounts), we'd hit the DB pointlessly millions of times a day.

A single Redis bloom filter (via RedisBloom) with 20M bits and a 1% false positive rate lets us answer "definitely does not exist" without touching MySQL. If the bloom filter says "might exist," we fall through to the real lookup. If it says "does not exist," we return 404 immediately.

```
BF.ADD users:bloom {userID}   # on account creation
BF.EXISTS users:bloom {id}    # on lookup
```

Roughly 40% of existence checks in our traffic get answered by the bloom filter alone. That's tens of millions of DB queries avoided per day.

### 6. Game Rebate Rule Cache — Rarely Changes, Often Read

Rebate rules (VIP tier → cashback percentage) change maybe twice a week but are read on every transaction. This cache uses a long TTL (1 hour) with a cache-aside pattern, plus a pub/sub channel on rule changes so all services invalidate immediately. Classic "read-heavy, invalidate on rare write."

Stored as a Redis Hash keyed by tier, field per rule type. One HGETALL fetches everything, parsed once in Go and reused across the whole request.

### 7. Sliding Verification Code Cache

CAPTCHA codes, SMS codes, rate-limit windows. Each is a short-lived string with TTL matching expected validity, plus a separate counter for attempt limits. The pattern is boring but critical — it's the layer that absorbs abuse.

We use `SET NX` to insert the code (no overwrite if one already exists) and a separate `INCR` counter for attempts with its own TTL. Three wrong attempts → force re-request. No distributed lock, no race.

## TTL Strategy: Jitter Is Non-Negotiable

Every layer uses TTL with jitter. The formula:

```go
func ttlWithJitter(base time.Duration) time.Duration {
    jitter := time.Duration(rand.Int63n(int64(base) / 10)) // ±10%
    return base + jitter - base/20
}
```

Why: if 100k cache entries all expire at the same instant, you get a thundering herd of DB queries. Jitter spreads them across a window. The first time we deployed this service without jitter, a scheduled cache refresh brought the DB to its knees every 10 minutes on the dot. Since adding jitter, the DB load graph looks boringly flat.

## Stampede Prevention

Two techniques stacked:

**Single-flight locks.** When a cache miss happens, the first requester acquires a short Redis lock (`SETNX lock:{key} 1 EX 5`). The rest wait briefly and retry the cache. Only one goroutine hits the DB for a given key.

**Refresh-ahead for the hottest keys.** For the top-100 most-queried users, we background-refresh at TTL * 0.8 — so the cache entry is replaced *before* it expires. Requests never hit a miss for these keys.

## Pipeline-Batched Operations

Each write path touches 3-5 layers. Doing them sequentially costs 5 round trips:

```go
pipe := redis.Pipeline()
pipe.HSet(ctx, userKey, userFields)
pipe.Expire(ctx, userKey, ttl)
pipe.ZAdd(ctx, onlineKey, userID)
pipe.SAdd(ctx, tenantKey, userID)
_, err := pipe.Exec(ctx)
```

One round trip instead of four. On a hot endpoint this alone cut p99 by 3ms. Redis pipelines are under-used in Go codebases — the mental model of "one call per operation" dies hard — but the perf gain is too big to ignore.

## Consistency Notes

We accept eventual consistency everywhere except credit quota (which is atomic) and token revocation (which is fail-open). The tradeoffs:

- A user's profile cache can be 10 minutes stale. Acceptable — profile data rarely matters for correctness.
- A VIP tier upgrade takes up to 1 hour to affect rebates. Flagged in the UI so users know.
- Account existence checks via bloom filter can have 1% false positives (returns "might exist" when it doesn't). Safe — the DB check catches it.

Writing "what staleness we accept" in the design doc upfront saved us from a dozen would-be bugs that would've been arguments later. When a PM asks "why did X take 10 minutes to update?", the answer is a link, not a meeting.

## What I'd Change

If I were building this again:

- I'd split Redis clusters earlier. Layer 4 (security tokens) was on the main cluster for 6 months before a password-reset storm during a promotion knocked out layers 1-3 too. Isolation should've been day-one.
- I'd invest in cache observability sooner. Hit rate, miss rate, and per-key latency histograms per layer made the architecture legible. Before that, debugging a slow endpoint meant reading code; after, it meant reading dashboards.
- I'd push more work into Redis via Lua scripts. A few of the credit-quota paths still make 3 round trips where a single EVAL would do. Lua isn't glamorous but it's the right tool for atomic multi-key updates.

The caches are not the product, but the product doesn't run without them. Treating the cache architecture as a first-class design document — with layer names, invalidation contracts, and explicit staleness bounds — is the move I'd push for on any read-heavy service from day one.
