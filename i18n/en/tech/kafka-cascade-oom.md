---
translatedFrom: "tech/kafka-cascade-oom"
lang: "en"
title: "An OOM I Introduced Myself: Cascading Updates Down a 10-Level Partner Network"
excerpt: "A cascading update pushed a Kafka consumer into OOM, and the root cause was my own change. The fix: find where order truly matters, batch everything else, and memory is bounded by batch size."
readTime: 8
sourceHash: "41d5a2ee042ab53a"
---

I introduced this OOM myself. The logic change was correct, but I never tested it against a large network. After it shipped, whenever a top-level partner in a large tenant changed their settings, the cascade consumer's pod filled its memory, got killed, restarted, and filled it again.

This post covers how it happened, how I fixed it, and what was still left after the fix.

## Background: a tree that must keep an invariant

The platform's partner network is a tree, up to 10 levels deep in the standard mode. Each node has revenue-share rules broken down by product category, and transaction limits per currency.

The system has to keep one invariant: **a child's value can never exceed its direct parent's**. When a parent changes their settings, the service emits a cascade event, and a Kafka consumer re-clamps the whole downline.

A colleague wrote the first version of this consumer. It processed in batches, but compared every descendant against "the person who was changed". The requirement then changed to **clamp each node to its own direct parent's new value**, and that change was mine. To get each descendant's direct parent's new value, I replaced the original 200-per-batch loop with a single load of every descendant's settings and their parents' settings.

The logic was right. The memory had no upper bound.

## Symptoms: one message stalls a partition

After release I kept watching the consumer:

- whenever a top-level partner in a large tenant changed a rule, the consumer's pod filled its memory and was OOMKilled, then restarted;
- the message's offset hadn't been committed when the pod died, so it was redelivered after the restart, hit OOM again, and the pod went into a restart loop;
- every later event on the same partition was blocked behind it;
- small tenants were completely fine.

That last point was the key: failing only on large networks meant the problem was about data size, not wrong logic.

## Diagnosis: a load that grows with the network

1. **Narrow it down**. It only happened on cascade events, only on large networks, and started right after my change.
2. **Estimate the memory**. Settings rows = descendants × product categories × types, and each row carries a per-currency JSON. Loading it all at once means deserialising the settings of the entire subtree into memory. Memory grows linearly with the network and has no upper bound.
3. **Confirm**. In the diff, the only structural change was switching from "batched" to "load everything".

## The fix: find the dependency first, then batch

I had switched to loading everything because I worried batching would break correctness: a descendant must be compared with its direct parent's **new** value, and if a lower level were computed first, it would read the parent's old value.

Once I drew the dependencies, the answer was clear: **there are dependencies between levels, but none within a level**. Only the levels have to run in order; within a level, batching is free.

```text
Parent P changes settings → write to DB → emit cascade event {old, new, options}
                                │
[cascade consumer]  on failure → dedicated retry topic (bounded attempts, growing delay) → dead letter
  1. Find all of P's descendants (id and depth only)
  2. Group by depth and process top-down, level by level:
       split each level into batches of 200
         → load only the (new) settings of this batch's direct parents
         → clamp each descendant to its direct parent's new value → write to DB
         → pause 50 ms between batches
  3. Invalidate the cache for affected users
```

The core loop looks roughly like this (illustrative code, not the original):

```go
for depth := 1; depth <= maxDepth; depth++ { // levels run in order: the next level only sees new values once this one is written
	ids := idsByDepth[depth]
	for start := 0; start < len(ids); start += batchSize {
		batch := ids[start:min(start+batchSize, len(ids))]

		// load only this batch's direct parents, so memory depends only on batchSize
		parents, err := store.LoadParentSettings(ctx, batch)
		if err != nil {
			return err
		}
		updated := clampToParents(batch, parents) // a child can't exceed its direct parent
		if err := store.SaveSettings(ctx, updated); err != nil {
			return err
		}
		time.Sleep(pause) // background job: leave the database to online requests
	}
}
```

The trade-offs:

| Choice | Reason | Alternative not taken |
|---|---|---|
| Top-down, level by level | Levels depend on each other; nodes within a level don't | Topologically sort the whole tree in memory, which is exactly what caused the OOM |
| Load only direct parents per batch | When a level is wide, the whole parent level is large too | Load the entire parent level (my first fix did this; I narrowed it later) |
| Serial within a batch, 50 ms between batches | The cascade is a background job with no real-time requirement | Concurrency within a level, which multiplies the load on MySQL |
| Keep the rules in Go | Clamping involves per-currency JSON and several types | Compute it all in one recursive-CTE SQL query, which can't express these rules |

The fix shipped in two steps: first level-by-level batching, which ended the OOM; then narrowing "read the whole parent level" down to "read only this batch's direct parents".

Verification: before the fix, I reproduced the OOM in the test environment with a dataset the size of a large tenant. After the fix, triggering the cascade on the same data kept pod memory flat, with the peak depending only on "200 people plus their direct parents", not on the size of the network. Once released, this consumer never hit OOM again.

## What was left after the fix

The OOM was gone, but two root problems remained: nothing coordinated changes on the same line of the tree, and a single Kafka message with a single handler had to process an entire subtree synchronously.

What concerned me most was **concurrent changes on the same line**. Picture a network A → B → C:

- admin 1 changes A from 12% to 5%;
- at the same time, admin 2 changes B to 8%. Admin 2's validation reads A's old value of 12%, so it passes;
- admin 1's cascade clamps B to 5% first, and then admin 2's write sets B = 8%.

In the end B > A, both sides got a success response, and the invariant is broken. Out-of-order consumption is just a special case of this.

The other problems come from the same structure:

- **One message runs for a long time**. When a rolling deploy triggers a rebalance, a long handler can time out and be kicked out of the consumer group, and another instance reruns the message from the start;
- **Failures are too coarse**. When a batch in the middle fails, the error isn't propagated all the way up (this part was inherited from the original code), so the result can be "partly applied, but not retried", and progress isn't visible;
- **Rate limiting only works per instance**. 200 / 50 ms is a fixed value inside each consumer; when several instances run cascades at once, the load on the database adds up.

## If I did it again: commands through a workflow, events through Kafka

This is a design I came up with after fixing the OOM. It wasn't built before I left, so it is only a design.

A cascade is really a **command**, not an event: the caller needs to know the outcome, needs protection against concurrent changes, and needs per-batch retries. So I would have the admin API start a Temporal workflow directly, with the new settings as its input. The workflow first writes the node's own settings, then cascades down level by level and batch by batch, one activity per batch; when everything is done, it emits a "settings changed" event that downstream consumers such as audit and caching subscribe to on their own.

Changes on the same line are serialised with a "branch lock". The lock covers all of the target node's ancestors plus all of its descendants: only those nodes' subtrees can overlap with it, so sibling branches still run in parallel. While a cascade is in progress, a second change on the same line is simply rejected; this is a low-frequency admin operation, so the cost of "queue and retry" is acceptable.

That gives each of the problems above an answer: only one cascade runs on a given line at a time, so the preconditions for the race and for out-of-order updates are gone; with one activity per batch, a failure retries only that batch, and progress is visible in the UI; rate limiting is configured centrally on the task queue instead of each instance sleeping on its own. The cost is a new dependency on the Temporal cluster, plus the determinism constraints that workflow code has to follow.

## What I took away

**Decide where things truly have to run in order, then batch everywhere else**. This OOM started because, for the sake of correctness, I treated the whole problem as one that "has to see everything at once"; all it really needed was "order between levels". Once I drew the dependencies, memory went from "growing with the data" to "depending only on batch size", an upper bound you can calculate.

The other lesson is simpler: getting the logic right doesn't mean the change is done. Any code whose workload grows with tenant size should be run against the largest tenant's data before it ships.
