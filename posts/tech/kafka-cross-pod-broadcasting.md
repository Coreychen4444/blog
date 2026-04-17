---
title: "Cross-Pod Message Broadcasting with Kafka"
topic: "tech"
type: "essay"
status: "published"
date: "2026-01-10"
excerpt: "Solving the multi-instance WebSocket broadcasting problem using Kafka consumer groups and Redis-tracked connection state."
author: "Corey Chen"
tags: ["Kafka", "WebSocket", "Distributed Systems", "Go"]
readTime: 10
featured: true
---

When you scale a WebSocket service to multiple pods, you hit a problem that single-pod deployments never see: **how does a message sent to Pod A reach a user connected to Pod B?** It looks trivial on a whiteboard. It isn't. What follows is the architecture we landed on after burning through two simpler designs, why those simpler designs failed, and the operational lessons that came with running this at 100k concurrent connections.

## The Problem

A WebSocket is a stateful connection. Unlike HTTP, where any pod can answer any request, a WebSocket binds a user to the specific pod that accepted the upgrade handshake. Once a client is connected to Pod A, all messages *to* that client must flow through Pod A.

Now imagine an admin broadcasting an announcement. The HTTP request to publish the announcement lands on Pod C (by chance, via the load balancer). Pod C has no idea which users are online, and even if it did, it can't push to their sockets directly — those sockets live on other pods.

You need a way for Pod C's publish call to reach Pods A, B, D, E... all of them, so each can forward to locally-connected users.

## Attempt 1: Redis Pub/Sub

The obvious first try. Every pod subscribes to a Redis channel. When Pod C receives a publish, it writes to the channel. Every pod reads it and forwards to locally-connected users.

This works — until it doesn't. Redis Pub/Sub is fire-and-forget. If Pod B is mid-restart when the message is published, it never sees it. We saw users intermittently miss announcements during rolling deploys, and there was no way to replay — Pub/Sub has no memory. A "reliable messaging" system that silently drops messages is a bug factory.

## Attempt 2: Direct RPC Fan-Out

We tried the opposite extreme: on publish, loop through every pod and call a gRPC push endpoint. This works, but it scales poorly. Adding a pod means updating every publisher's peer list. The failure semantics are a nightmare — if pod D is slow, does the publish block? Time out? Partially succeed? We spent a week writing retry and circuit-breaker logic before realizing we were rebuilding what Kafka already does.

## Attempt 3: Kafka + Per-Pod Consumer Groups

This is the design that worked and stayed working. The contract is simple:

1. Every broadcast message is produced to a single Kafka topic: `ws-broadcast`.
2. Every pod consumes this topic **in its own consumer group**. The group ID includes the pod's identity, e.g. `ws-broadcast-pod-<podID>`.
3. When a pod consumes a message, it fans out to locally-connected users it finds in its in-memory socket map.

The key insight: **per-pod consumer groups means every pod reads every message.** That's the opposite of how you normally use consumer groups (where the group shards the work). Here we *want* duplication — every pod needs to see every broadcast to check its local socket table.

```go
config := sarama.NewConfig()
config.Consumer.Return.Errors = true
config.Consumer.Offsets.Initial = sarama.OffsetNewest

groupID := "ws-broadcast-" + os.Getenv("POD_NAME")
consumer, _ := sarama.NewConsumerGroup(brokers, groupID, config)

for {
    consumer.Consume(ctx, []string{"ws-broadcast"}, handler)
}
```

Since each pod owns its own consumer group, Kafka tracks its offset independently. A pod that crashes and restarts resumes from its last committed offset — exactly the replay we were missing with Pub/Sub.

## Redis for Connection State

Kafka solves routing. It doesn't solve knowing **who's online** or **where**. For that we use Redis.

Three data structures, each for a different query shape:

**Sorted Set** — global online presence, scored by last-seen timestamp:

```
ZADD ws:online <timestamp> <userID>
```

This lets us ask "is user 123 online?" in O(logN), and run a ZRANGEBYSCORE to find stale entries to evict. It's also the backbone for presence features ("N users online right now").

**Set** — per-tenant member lists:

```
SADD ws:tenant:<tenantID> <userID>
```

Broadcasting to a tenant means `SMEMBERS` + produce once to Kafka with the tenant ID as routing key. Every pod reads the message and intersects its local socket map against the tenant set.

**String with TTL** — per-connection details:

```
SET ws:conn:<userID> <podID>:<connID>:<connectedAt> EX 60
```

Refreshed every 30s via heartbeat. If the key expires, the user is considered disconnected and the presence ZSet entry is cleaned up by a janitor goroutine.

## Failure Modes We Learned the Hard Way

Most of the design choices above came from watching this thing fail in production. A few that stick out:

**Thundering herd on pod startup.** When a pod boots, it joins all consumer groups and Kafka rebalances. If three pods restart simultaneously during a deploy, the rebalance can take 10+ seconds, during which no messages are delivered. We mitigated this with a pre-warm: pods subscribe to Kafka *before* accepting WebSocket connections, so by the time the load balancer sends them traffic, consumption is live.

**Orphaned consumer groups.** Dead pods leave their consumer group behind, and Kafka keeps tracking offsets forever. We wrote a nightly job that lists consumer groups matching `ws-broadcast-*`, checks if the pod is still in Kubernetes, and deletes orphans. Without it, metadata grew unbounded.

**The "everyone sees everything" scaling wall.** Per-pod fan-out means that at some point each pod is busy just reading messages it won't forward (because the target user isn't local). We hit this around 80 pods with 10k messages/sec. The fix was a two-tier design: messages are first published to a routing topic keyed by `tenantID`, consumed by a routing service that knows which pods hold which tenants, then republished to pod-specific topics. Latency went up by 2ms; per-pod CPU dropped by 60%.

**Duplicate messages during rebalance.** Kafka's at-least-once semantics mean the same message can arrive twice. For broadcasts this is annoying but tolerable — we dedupe in the client via a message UUID stored in localStorage. For direct user-to-user messaging we use idempotency keys at the WebSocket protocol layer.

## Closing Note

The final architecture is three boxes on a diagram: a producer, Kafka, and N pods each with their own consumer group plus Redis state. The power is in the boring parts: every component has exactly one job, the failure semantics are explicit, and adding a pod is a matter of scheduling — no peer lists, no config changes, no cross-service coordination.

Horizontal scalability is a nice side effect. The real win is that when something breaks at 3 AM, you can tell *where* it's broken. Producer side? Check Kafka's producer metrics. Consumer side? Check offset lag per pod. Delivery side? Check the Redis connection map. The number of places the bug can hide is small enough to enumerate in your head — and that, more than any single clever trick, is what keeps this system running.
