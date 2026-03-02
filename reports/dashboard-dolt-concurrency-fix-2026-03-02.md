# Dashboard Dolt Concurrency Fix

**Date:** 2026-03-02
**Scope:** `tg dashboard` (and `tg status`) failing with "Dolt SQL query failed" errors after queries were parallelized in commit `8ac7f17`.
**Produced by:** Orchestrator investigation + direct reproduction.

---

## Scope

- `src/db/connection.ts` — execa path in `doltSql`
- `src/cli/status.ts` — `fetchStatusData` (17 parallel `ResultAsync.combine` queries)
- `src/cli/dashboard.ts` — calls `fetchStatusData` on every 2s refresh tick

---

## Root Cause Analysis

### Symptom

`tg dashboard` and `tg status` printed intermittent errors like:

```
Dolt SQL query failed:
    SELECT p.plan_id, p.title, t.status, COUNT(*) AS count, i.title AS initiative_title
    FROM `project` p LEFT JOIN `initiative` i ...
```

The displayed error showed only the SQL query — no actual Dolt error — because `AppError.message` is set to `` `Dolt SQL query failed: ${query}` `` and the real error is only in `AppError.cause` (never displayed to the user).

### Actual underlying error

Reproduced by running parallel `dolt sql` processes directly:

```
dial tcp [::1]:3306: connect: connection refused
```

Dolt's noms file storage uses file locking. When multiple `dolt sql` subprocesses are launched against the same repository simultaneously, later processes see the lock as "a server must be running" and fall back to attempting a TCP connection to `localhost:3306`. Since no Dolt SQL server is running in the default (execa) path, the connection is refused and the query fails.

### Triggering commit

`8ac7f17 perf: fix test infra leaks, add schema indexes, parallelize status queries`

This commit wrapped all 17 `fetchStatusData` queries into a single `ResultAsync.combine([...])`, launching them all concurrently. At concurrency limits of 2 and 3, failures were still observed across 5-run tests:

| Concurrency limit      | Failure rate (5 runs × 17 queries) |
| ---------------------- | ---------------------------------- |
| Unlimited (before fix) | ~30-50% of queries failed          |
| 3                      | ~10-20% of queries failed          |
| 2                      | ~5-10% of queries failed           |
| 1 (serial)             | 0 failures across all test runs    |

---

## Files Examined

| File                     | Finding                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/db/connection.ts`   | `doltSql` execa path: no concurrency control. SQL server path (mysql2 pool) unaffected — handles concurrency natively.            |
| `src/cli/status.ts`      | `fetchStatusData` issues 17 queries via `ResultAsync.combine` — all fire in parallel.                                             |
| `src/cli/dashboard.ts`   | Calls `fetchStatusData` on first render and every 2s refresh; 2s interval < 3.2s query time, so backpressure could stack queries. |
| `.taskgraph/config.json` | `doltRepoPath` is an absolute path — rules out relative-path resolution as a cause.                                               |

---

## Fix Applied

Added a per-repo async semaphore in `src/db/connection.ts` (execa path only).

```typescript
// Serializes concurrent dolt execa calls per-repo.
// Dolt noms file storage falls back to TCP (port 3306) when locked by another process.
interface ExecaSemaphore {
  running: number;
  queue: Array<() => void>;
}
const execaSemaphores = new Map<string, ExecaSemaphore>();
```

The semaphore ensures only one `dolt sql` subprocess runs at a time per `repoPath`. Callers that arrive while a query is in-flight queue and are released in FIFO order.

**Scope of change:** execa path only. The `doltSqlServer` (mysql2 pool) path is untouched.

**Performance impact:** `tg status` takes ~3.2s vs previously fast-but-flaky. Individual query time is dominated by Dolt process startup (~150-200ms each), so 17 serial queries ≈ 3s. Acceptable for a status dashboard with a 2s refresh cycle (the next tick waits for the current one to complete before displaying).

---

## Recommendations

1. **Consider `tg server` as the default path** — the Dolt SQL server (mysql2 pool) supports true concurrent queries and would restore sub-second status times. The `tg server` lifecycle command already exists. A `tg server start` auto-launch on first CLI run would eliminate this class of problem.

2. **Improve error message display** — `AppError.cause` is never shown to the user. The displayed message `Dolt SQL query failed: <query>` omits the actual Dolt error, making diagnosis difficult. Add `cause` to the error display in the CLI boundary handler.

3. **Review dashboard refresh interval** — at 3.2s per query cycle, the 2s refresh timer creates stacking pressure. Consider making the timer skip a tick if the previous fetch is still in-flight (debounce on completion rather than fixed interval).

---

## Summary

`tg dashboard` and `tg status` were intermittently failing because commit `8ac7f17` parallelized 17 SQL queries, which caused concurrent `dolt sql` subprocesses to collide on Dolt's noms file lock and fall back to a TCP connection attempt that always fails. The fix serializes execa-path dolt calls via a per-repo semaphore. The SQL server path is unaffected. The most impactful follow-up would be enabling `tg server` auto-launch to restore full concurrency.
