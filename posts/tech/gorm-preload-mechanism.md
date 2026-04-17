---
title: "Deep Dive into GORM Preload Mechanism"
topic: "tech"
type: "essay"
status: "published"
date: "2026-03-15"
excerpt: "Understanding how GORM's Preload works under the hood — from lazy loading pitfalls to optimized eager loading strategies in Go microservices."
tags: ["Go", "GORM", "MySQL", "Performance"]
readTime: 8
---

GORM's `Preload` is one of the most powerful features for handling relational data in Go. But without understanding its internals, it's easy to fall into N+1 query traps that silently kill your service performance. I've spent enough late nights staring at slow-query logs to know that Preload's convenience has a price — and the price is paid in round trips, not CPU.

This post is the note I wish I had when I started. We'll walk through exactly what SQL `Preload` generates, when to prefer `Joins`, how to keep the query count bounded, and the production patterns I've landed on after shipping this in services that handle millions of requests a day.

## The N+1 Problem Preload Tries to Solve

Start with the simplest case. You have `User` with many `Order`s:

```go
type User struct {
    ID     uint
    Name   string
    Orders []Order
}

type Order struct {
    ID     uint
    UserID uint
    Total  int64
}
```

Without eager loading, fetching 100 users and their orders is:

```go
var users []User
db.Find(&users)                     // 1 query
for i := range users {
    db.Where("user_id = ?", users[i].ID).Find(&users[i].Orders) // N queries
}
```

That's 101 queries for 100 users — the canonical N+1. In a MySQL deployment with a network RTT of 1ms, you've added a free 100ms before a single byte of application logic runs.

## How Preload Generates SQL

Preload fixes N+1 by collapsing the N association queries into **one**. Here's what actually happens when you call `db.Preload("Orders").Find(&users)`:

1. GORM runs the base `SELECT * FROM users`.
2. It collects the primary keys from the result set: `[1, 2, 3, ..., 100]`.
3. It runs a single `SELECT * FROM orders WHERE user_id IN (1, 2, ..., 100)`.
4. In Go, it assigns the orders back to each user by matching `user_id`.

So the query count is **2**, not 101. GORM is trading N SQL round trips for a larger `IN` list and one extra pass through memory.

You can verify this with GORM's logger:

```go
db := db.Debug().Preload("Orders").Find(&users)
// [0.321ms] SELECT * FROM `users`
// [0.854ms] SELECT * FROM `orders` WHERE `user_id` IN (1,2,3,...)
```

### Nested Preload: It's Recursive

`Preload("Orders.Items")` works the same way — recursively. GORM runs three queries: users, orders (by user_id), items (by order_id). Each level is one round trip, not N.

One subtle thing: if you have three levels deep with 1000 parents, the leaf-level `IN` list can get huge. MySQL's `max_allowed_packet` (default 64MB) usually absorbs it, but at some point the parser itself becomes the bottleneck. I've seen single queries with 50k-element `IN` lists take 200ms in planning alone. Chunk aggressively if you're paginating over large result sets.

## Preload vs Joins: Two Different Tools

`Preload` and `Joins` look interchangeable in GORM's DSL but produce very different SQL.

**Preload** issues separate queries and stitches in Go:

```sql
SELECT * FROM users;
SELECT * FROM orders WHERE user_id IN (...);
```

**Joins** produces one query with a JOIN:

```sql
SELECT users.*, orders.*
FROM users LEFT JOIN orders ON orders.user_id = users.id;
```

The tradeoffs:

- **One-to-one / many-to-one:** prefer `Joins`. One query, no duplication, no stitching overhead.
- **One-to-many:** prefer `Preload`. `Joins` duplicates the parent row for each child, inflating bytes over the wire and forcing you to deduplicate in application code.
- **Many-to-many:** always `Preload`. GORM's join-table handling with `Joins` is verbose and error-prone.
- **When you need to filter by the associated table:** use `Joins` for the WHERE clause, then `Preload` separately if you need the full association. Mixing them is fine.

### The row-duplication trap

I once "optimized" a user-list endpoint by switching from `Preload` to `Joins` on a one-to-many association. Load time went from 180ms to 2.4 seconds. Why? Each user had ~200 orders, so the join produced 200 rows per user. For 500 users that's 100k rows of mostly-duplicated user data. The query itself was fast — the wire cost and Go-side deduplication destroyed it.

Rule of thumb: if the child table has unbounded cardinality, `Preload`. Always.

## Custom Preload Scopes

The feature that moved Preload from "convenient" to "indispensable" for me is the function-argument form:

```go
db.Preload("Orders", func(tx *gorm.DB) *gorm.DB {
    return tx.Where("status = ?", "paid").
        Order("created_at DESC").
        Limit(10)
}).Find(&users)
```

This lets you constrain the preloaded rows. Common patterns I use in production:

**Status filter** — only load active children:

```go
db.Preload("Subscriptions", "status = ?", "active").Find(&users)
```

**Limit + order** — top-N per parent is tricky; plain `Limit` applies globally, not per parent. For per-parent limits you need a window function:

```go
db.Preload("Posts", func(tx *gorm.DB) *gorm.DB {
    return tx.Where("id IN (?)",
        tx.Model(&Post{}).Select(
            "FIRST_VALUE(id) OVER (PARTITION BY user_id ORDER BY created_at DESC)",
        ),
    )
})
```

Ugly, but it's one query. The alternative — issuing N limited queries — is exactly the N+1 we started with.

**Selective columns** — preload pulls `SELECT *` by default. On a wide table that's wasteful:

```go
db.Preload("Orders", func(tx *gorm.DB) *gorm.DB {
    return tx.Select("id, user_id, total, created_at")
}).Find(&users)
```

I've seen this alone cut response times by 30% on endpoints that touched a BLOB column nobody actually used.

## Production Tips

A few patterns that keep Preload from hurting in production:

- **Always cap your `IN` list.** If you might preload against 10k parents, chunk them into batches of 1k before hitting the DB. MySQL can handle big `IN` clauses but planning time grows non-linearly.
- **Count your queries in tests.** Write a helper that wraps `*gorm.DB` and counts executions. Assert "this endpoint runs ≤ 5 queries" so regressions are loud, not invisible.
- **Beware of polymorphic associations.** `Preload("Attachments")` on a polymorphic field issues one query *per type*, not one total. Unintuitive and worth a unit test.
- **Turn on `PrepareStmt`.** It caches prepared statements across requests. For an endpoint that runs the same 4 queries in sequence, this removes a surprising chunk of per-query overhead.
- **Read the Debug output once per endpoint.** GORM's fluent API hides a lot. The only way to know what SQL you're shipping is to look.

## Closing Note

Preload is a lever. Pulled correctly, it collapses hundreds of round trips into two or three. Pulled carelessly, it still collapses them — but it also loads columns you don't use, joins you didn't want, and children you never filter. The mental model I keep in my head: **every `Preload` is a separate query; every `Joins` is a larger row**. Once that's internalized, the right choice at each branch becomes obvious.

The fastest query is still the one you don't run. Cache at the edge, shape your schema so the hot paths don't need three-level joins, and save Preload for when the relational model actually fits the shape of the request.
