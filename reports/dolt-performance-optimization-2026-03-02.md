# Dolt Performance Optimization Research

**Date:** 2026-03-02
**Scope:** Research into performance optimization opportunities for Task-Graph's Dolt database access layer, covering the execa path, server mode, query patterns, and storage configuration.
**Produced by:** Research skill — web search + codebase analysis.

---

## Current Architecture

Two Dolt access paths exist in `src/db/connection.ts`:

| Path                | Mechanism                                       | Concurrency                       | Per-query overhead                      |
| ------------------- | ----------------------------------------------- | --------------------------------- | --------------------------------------- |
| **Execa** (default) | Spawns `dolt sql -q <query> -r json` subprocess | Semaphore limit=1 (strict serial) | ~100-200ms process spawn + storage init |
| **Server** (opt-in) | `mysql2` pool → `dolt sql-server` over TCP      | `connectionLimit: 10`, concurrent | Sub-millisecond socket round-trip       |

Server mode is activated by setting `TG_DOLT_SERVER_PORT` + `TG_DOLT_SERVER_DATABASE`. The routing logic is already in place; the server path is production-ready.

### Query counts per hot command

| Command             | Approx. DB round-trips | Notes                                                                                                                                                   |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tg start`          | ~9                     | select task, select plan_worktree, runnable check (events), update task, insert event, update project, dolt_add, dolt_commit, possibly ensurePlanBranch |
| `tg done`           | ~5–8                   | select task, update task, insert event, dolt_commit, edge query, syncBlocked, autoComplete, possibly 2nd commit                                         |
| `tg next`           | ~2                     | recoverStaleTasks + complex JOIN query                                                                                                                  |
| `tg status --tasks` | ~4–6                   | multiple raw queries + initiative/cycle table checks                                                                                                    |

On the execa path each round-trip pays the full spawn overhead. At 100ms/query, `tg start` takes ~900ms in pure spawn tax before any logic runs.

---

## Findings

### Finding 1 — Server mode is the largest single win

Running `dolt sql-server` as a persistent background process eliminates per-query subprocess spawn overhead entirely. The codebase already supports this; it is not a new feature. A `tg start` with 9 queries at 100ms spawn overhead = ~900ms of wasted time. In server mode this collapses to ~10-30ms total for the same 9 round-trips.

Relevant Dolt posts:

- [Per-Branch Connection Pools (Aug 2025)](https://www.dolthub.com/blog/2025-08-04-branch-connection-pooling/)
- [Server Connections Improved (Mar 2025)](https://www.dolthub.com/blog/2025-03-27-server-connections-improved/)

### Finding 2 — Prepared statements are free performance in server mode

`doltSqlServer()` currently uses `pool.query()` — this sends the query as a string every time, requiring server-side parse + plan on each call. Switching to `pool.execute()` uses the MySQL binary protocol with prepared statement caching. mysql2 caches up to 16,000 statements per connection. Dolt supports server-side cached prepared statement plans since v0.22.0.

Hot queries that repeat on every `tg start`/`tg done`/`tg next` would pay compilation cost once:

- `SELECT status, hash_id, plan_id FROM task WHERE task_id = ?`
- `UPDATE task SET status = ?, updated_at = ? WHERE task_id = ?`
- `INSERT INTO event (...) VALUES (...)`

This requires the query builder to produce parameterized queries (`?` placeholders + params array) rather than string-interpolated values. `query.ts`'s `formatValue()` currently inlines values.

Relevant: [mysql2 Prepared Statements](https://sidorares.github.io/node-mysql2/docs/documentation/prepared-statements), [Dolt Cached Prepared Statements (Apr 2022)](https://www.dolthub.com/blog/2022-04-20-prepared-statements/)

### Finding 3 — DOLT_CHECKOUT in server mode is an anti-pattern

`src/db/connection.ts` uses `CALL DOLT_CHECKOUT(?)` when `options.branch` is set in server mode. DoltHub explicitly warns against this in application code:

> _"Applications should not use `dolt_checkout()`. ORM and client libraries which connect to SQL databases assume that the database behaves in a pretty consistent way... The libraries can have caching or other optimizations which fall apart with Dolt's branching model."_

The correct pattern is to connect to branches as separate databases: `database: "mydb/branch-name"`. Each branch-specific connection pool has smaller `connectionLimit` (e.g. 5). Branch management operations (merge, delete) go through the main pool.

This also saves a round-trip per branched query (no DOLT_CHECKOUT call needed).

### Finding 4 — Query batching can reduce round-trips by 40-60%

Even in server mode, sequential `.andThen()` chains mean multiple TCP round-trips. Opportunities:

- **`tg start`**: `UPDATE task` + `INSERT event` + `UPDATE project` could be a single transaction or multi-statement.
- **`doltCommit`**: `CALL DOLT_ADD('-A')` + `CALL DOLT_COMMIT(...)` are two round-trips that could be a single stored procedure call or multi-statement string.
- The migration probe (`BATCH_PROBE_SQL`) already demonstrates this pattern — 30+ existence checks in one query. Apply it to hot write paths.

### Finding 5 — Archive format + auto GC for storage efficiency

Dolt's archive format (available since v1.52.1) uses zStd dictionary compression:

- 25-50% smaller storage than default table files
- Relevant for the execa path: smaller storage means less data to read on each subprocess startup (noms index load)
- Enable via `config.yaml`: `auto_gc_behavior: { enable: true }`, `archive_level: 1`

Automatic GC (available since Dolt 1.75) runs in both `dolt sql-server` and `dolt sql` contexts, cleaning up orphaned chunks from uncommitted transactions, deleted branches, and imports.

Reference: [Enable Dolt Archives with Auto GC (May 2025)](https://www.dolthub.com/blog/2025-05-14-archive-with-auto-gc/)

### Finding 6 — Disable statistics during heavy import/batch workflows

Dolt 1.51.0+ collects table statistics automatically. For import-heavy workflows (`tg import` with many tasks), this adds background write overhead. Disable per-session with `SET @@PERSIST.dolt_stats_enable = 0` during batch operations.

Reference: [Stats Version 2 (Apr 2025)](https://www.dolthub.com/blog/2025-04-10-stats2/)

### Finding 7 — Dolt has reached MySQL read parity (Jan 2026)

As of January 2026, Dolt's Sysbench read benchmark mean latency multiplier vs MySQL is **1.00** (write is **0.96** — actually faster). This means in server mode, query execution time itself is not a significant overhead source. The bottleneck is entirely in the execa path's process spawn, not Dolt's query engine.

Reference: [More Read Performance Wins (Jan 2026)](https://www.dolthub.com/blog/2026-01-06-more-read-performance-wins/)

---

## Recommendations (ranked by impact/effort)

| Priority | Optimization                                           | Impact    | Effort  | Notes                                                            |
| -------- | ------------------------------------------------------ | --------- | ------- | ---------------------------------------------------------------- |
| 1        | **Switch to server mode**                              | Very High | Low     | Code already supports it; set env vars + start `dolt sql-server` |
| 2        | **Use `pool.execute()` for prepared statements**       | High      | Low-Med | Change `doltSqlServer()` + add parameterized mode to `query.ts`  |
| 3        | **Replace `DOLT_CHECKOUT` with branch-specific pools** | Medium    | Medium  | Create pool per branch, `database: "db/branch"` pattern          |
| 4        | **Archive format + auto GC**                           | Medium    | Low     | One-time `dolt archive` + `config.yaml` entry                    |
| 5        | **Disable stats during `tg import`**                   | Medium    | Low     | Add `SET @@dolt_stats_enable = 0` at import session start        |
| 6        | **Batch writes in hot commands**                       | High      | Medium  | Combine UPDATE + INSERT + project update into fewer round-trips  |
| 7        | **Reduce commits per operation**                       | Medium    | Medium  | Defer commits; batch dolt_add+dolt_commit into one call          |

---

## Summary

The dominant performance bottleneck is the execa path's per-query process spawn overhead (~100-200ms each), which multiplies across 5-9 sequential queries per `tg start`/`tg done` command. Switching to server mode (already implemented, just needs activation) would be the single highest-leverage change — eliminating ~500ms-1.5s of spawn tax per CLI invocation. Prepared statements via `pool.execute()` are a natural second step that compounds the server mode gain. Dolt's query engine itself is no longer the bottleneck; as of January 2026 it matches MySQL read performance in benchmarks.
