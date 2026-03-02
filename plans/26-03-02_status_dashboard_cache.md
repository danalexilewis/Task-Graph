---
name: Status and Dashboard Cache Integration
overview: Wire the existing QueryCache infrastructure into fetchStatusData and write commands for sub-second repeated status calls and efficient dashboard refresh.
fileTree: |
  src/
  ├── cli/
  │   ├── status-cache.ts           (create — singleton accessor + reset)
  │   ├── status.ts                 (modify — wire cachedQuery, hoist schema flags)
  │   ├── done.ts                   (modify — invalidate cache on success)
  │   └── <other write commands>    (modify — invalidate cache on success)
  └── db/
      └── cache.ts                  (no change — already complete)
  __tests__/
  └── cli/
      └── status-cache.test.ts      (create — cache hit rate, invalidation, disable flag)
risks:
  - description: Module-level singleton causes test bleed between integration test cases
    severity: medium
    mitigation: Export resetStatusCache() and resetSchemaFlagsCache(); call in beforeEach of affected tests.
  - description: cachedQuery.raw() extracts only the first FROM table for invalidation tagging; multi-table joins are undertagged
    severity: low
    mitigation: Write commands call cache.clear() (full flush), not invalidateTable(). No partial-miss risk.
  - description: Cross-process cache invalidation is impossible (separate OS processes)
    severity: low
    mitigation: TTL (2.5s default) bounds staleness. Within a single process, invalidation is exact. Dashboard refreshes every 2s, so worst-case lag is one tick.
tests:
  - "fetchStatusData called twice within TTL: doltSql call count = ~20 first call, 0 second call"
  - "tg done followed by fetchStatusData within TTL returns fresh data (cache was cleared)"
  - "TG_DISABLE_CACHE=1 bypasses cache and calls doltSql on every invocation"
  - "getSchemaFlags returns memoized result on second call within TTL"
todos:
  - id: wire-cache-singleton
    content: "Create status-cache.ts singleton and wire cachedQuery into fetchStatusData"
    agent: implementer
    changeType: create
    docs: [architecture, schema]
    intent: |
      Create src/cli/status-cache.ts:
        - Module-level QueryCache instance
        - export function getStatusCache(): QueryCache — lazy-init singleton
        - export function resetStatusCache(): void — clears and nulls the singleton (test isolation)
        - TTL from: Number(process.env.TG_STATUS_CACHE_TTL_MS ?? 2500)
        - TG_DISABLE_CACHE=1 -> ttlMs = 0 (cachedQuery passthrough mode)

      In src/cli/status.ts, update fetchStatusData, fetchProjectsTableData,
      fetchTasksTableData, and fetchInitiativesTableData:
        - Accept optional `cache?: QueryCache` param; default to `getStatusCache()`
        - Replace `q = query(repoPath)` with `q = cachedQuery(repoPath, cache, ttlMs)`
        - Import cachedQuery from src/db/cached-query.ts (already re-exported from query.ts)

      cachedQuery is at src/db/cached-query.ts. QueryCache is at src/db/cache.ts.
      Both are complete and unit-tested. This task is purely wiring.

      Result: first fetchStatusData call runs ~20 dolt processes; subsequent calls within TTL
      return all rows from cache with 0 dolt processes spawned.

  - id: hoist-schema-flags
    content: "Memoize tableExists checks in fetchStatusData via getSchemaFlags()"
    agent: implementer
    blockedBy: [wire-cache-singleton]
    changeType: modify
    docs: [schema, architecture]
    intent: |
      Currently fetchStatusData calls tableExists(repoPath, "initiative") and
      tableExists(repoPath, "cycle") on every invocation, BEFORE the main ResultAsync.combine.
      These go directly to doltSql via migrate.ts, bypassing cachedQuery entirely.
      Each is a separate dolt subprocess call.

      Add to src/cli/status-cache.ts (same file as wire-cache-singleton task):
        interface SchemaFlags { initiativeExists: boolean; cycleExists: boolean }
        type FlagsMemo = { flags: SchemaFlags; expiresAt: number }
        const schemaFlagsCache = new Map<string, FlagsMemo>()
        const SCHEMA_FLAGS_TTL_MS = 300_000  // 5 minutes — schema changes only on migration

        export function getSchemaFlags(repoPath: string): ResultAsync<SchemaFlags, AppError>
          - On hit (within TTL): return okAsync(cached.flags)
          - On miss: call tableExists twice in parallel, store result, return flags

        export function resetSchemaFlagsCache(): void — clears the Map (test isolation)

      Update fetchStatusData to call getSchemaFlags(repoPath) first (replacing the
      two tableExists calls), then use the returned flags throughout.

      Removes 2 sequential dolt subprocess calls from every fetchStatusData invocation
      after the first warm call.

  - id: write-invalidation
    content: "Clear status cache after successful mutations in all write commands"
    agent: implementer
    blockedBy: [wire-cache-singleton]
    changeType: modify
    docs: [cli, schema]
    intent: |
      After any successful write to Dolt in CLI write commands, call getStatusCache().clear()
      so the next status/dashboard fetch returns fresh data.

      Search src/cli/ for files that call q.insert, q.update, or raw DML (INSERT/UPDATE).
      Commands that mutate data include at minimum: done, start, cancel/abandon, block, note,
      import, task-new, split, crossplan, gate (unblock).

      For each write command:
        1. Import { getStatusCache } from "../cli/status-cache"
        2. In the success branch (after .match or .andThen confirms the write succeeded),
           call getStatusCache().clear()

      Use the explicit approach: each command calls .clear() in its own success path.
      Do NOT change the underlying query() calls in the write path itself.

      Important: this clears the cache within the same OS process only. The user's open
      dashboard (a separate process) will refresh on next TTL expiry. This is acceptable —
      the TTL (2.5s) matches the dashboard refresh interval (2s).

  - id: cache-integration-tests
    content: "Add integration tests for cache hit rate, invalidation, and disable flag"
    agent: implementer
    blockedBy: [wire-cache-singleton, hoist-schema-flags, write-invalidation]
    changeType: create
    docs: [testing]
    intent: |
      Create __tests__/cli/status-cache.test.ts.
      Use the existing integration test harness (real Dolt) from __tests__/integration/stats.test.ts
      as a reference for setup/teardown patterns.

      Call resetStatusCache() and resetSchemaFlagsCache() in beforeEach to prevent bleed.

      Test cases:
      1. Cache hit rate: import spyOn or mock doltSql. Call fetchStatusData twice within TTL.
         Assert doltSql call count is ~20 on first call and 0 on second call.

      2. Cache timing with real Dolt: first call duration is normal (sequential dolt procs);
         second call within TTL completes in < 50ms (no dolt procs). Assert t2 < 50.

      3. Write invalidation with real Dolt: warm the cache, call getStatusCache().clear(),
         call fetchStatusData again — verify it returns fresh data (doltSql called again).

      4. TG_DISABLE_CACHE=1: set env var, call fetchStatusData twice, assert doltSql is
         called on both invocations (no caching).

      5. getSchemaFlags memoization: assert tableExists is called on first invocation,
         not called on second invocation within TTL. resetSchemaFlagsCache() clears memo.

  - id: run-full-suite
    content: "Run pnpm gate:full and confirm all tests pass"
    agent: implementer
    blockedBy: [cache-integration-tests]
    changeType: modify
    intent: |
      Run pnpm gate:full from the plan worktree root. Report pass/fail.
      If tests fail, investigate root cause — likely test isolation (missing resetStatusCache
      in a beforeEach) or a TTL race in timing-sensitive tests.
      Fix any failures before marking done.
isProject: true
---

## Analysis

The `QueryCache` and `cachedQuery()` infrastructure was fully built in the "DAL Query Cache" plan (`afb6c5c2`) but never wired into any CLI command. This plan is the missing integration step.

### Current state

Every `tg status` or `tg dashboard` refresh call runs `fetchStatusData`, which issues **~20 sequential dolt subprocess calls** (17 in `ResultAsync.combine` + 2 `tableExists` + occasional `currentCycle`). The calls were serialized by the execa semaphore added today to fix file-lock contention. At 2s refresh: ~600 dolt processes per minute of dashboard uptime.

### Why this is fast to fix

- `cachedQuery(repoPath, cache, ttlMs)` is a drop-in replacement for `query(repoPath)` — same `{ select, update, insert, raw, count }` interface
- `ttlMs = 0` passes through to plain `query()` — passthrough mode is already handled
- The unit tests for both `QueryCache` and `cachedQuery` are complete

### Cache design

```
Process lifecycle
│
├── First fetchStatusData call
│     tableExists x2 (→ getSchemaFlags: miss → 2 dolt procs → memoize 5min)
│     ResultAsync.combine x17 (→ cachedQuery: miss → 17 dolt procs → cache 2.5s)
│
├── Second call (within 2.5s)
│     getSchemaFlags: HIT (0 dolt procs)
│     cachedQuery x17: HIT (0 dolt procs)  ← dashboard tick is free
│
├── tg done (write command)
│     getStatusCache().clear()  ← all cached entries evicted
│
└── Next fetchStatusData call
      full cold fetch (20 dolt procs) → re-warm cache
```

### Invalidation strategy

All status queries read from `task`, `project`, `event`, and `edge`. Any mutation to any of these tables makes all cached status data stale. Rather than per-table invalidation (which is complicated by multi-join queries), write commands call `getStatusCache().clear()` — a full flush. Simple, auditable, safe.

Cross-process limitation: the user's `tg dashboard` process and a sub-agent's `tg done` process are separate OS processes. `clear()` in the sub-agent process does not evict the dashboard's cache. The 2.5s TTL is the cross-process protection — the dashboard catches up within one 2s refresh tick.

### Dependency graph

```
Start:
  └── wire-cache-singleton   (create status-cache.ts, wire cachedQuery into status.ts)

After wire-cache-singleton:
  └── hoist-schema-flags     (add getSchemaFlags to status-cache.ts, update fetchStatusData)

After hoist-schema-flags:
  └── write-invalidation     (clear cache on successful mutations in write commands)

After write-invalidation:
  └── cache-integration-tests

After cache-integration-tests:
  └── run-full-suite
```

Serialized for reliability: `hoist-schema-flags` blocks on `wire-cache-singleton` since both create/extend `status-cache.ts` and update `status.ts`. The merge conflict risk outweighs the ~5-minute parallelism gain.

### Expected performance after

| Scenario                                    | Before              | After                                  |
| ------------------------------------------- | ------------------- | -------------------------------------- |
| `tg status` first call                      | ~3.2s               | ~3.2s (cold; no change)                |
| `tg status` second call within 2.5s         | ~3.2s               | < 50ms (cache hit)                     |
| Dashboard tick (2s interval, no write)      | ~3.2s per tick      | < 50ms (cache hit)                     |
| Dashboard tick after a write (TTL expired)  | ~3.2s               | ~3.2s (cold refresh)                   |
| `tg dashboard` running for 1 min, no writes | ~600 dolt processes | ~24 dolt processes (one cold per 2.5s) |

### Open questions

1. **`wire-cache-singleton` and `hoist-schema-flags` touch the same files** — if run in parallel, assign to one implementer or ensure worktree branching handles the merge. Safest to run them sequentially (add `hoist-schema-flags blockedBy wire-cache-singleton`) if merge conflicts are a concern.

2. **`tg next` and `tg context`** should never read cached data. They do not call `fetchStatusData`, so they are unaffected by this change. Confirm during implementation.

3. **Server pool path** (`TG_DOLT_SERVER_PORT` + mysql2): the cache works regardless of which path is active. On the server path, the cache reduces query load on the Dolt server; on the execa path, it eliminates subprocess spawning entirely.

<original_prompt>
/plan improve the system so our data request are more performant. it sounds like we need caching in front of dolt as well for normal status and dashboard requests.
</original_prompt>
