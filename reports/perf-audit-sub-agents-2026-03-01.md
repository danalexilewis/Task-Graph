# Performance Audit: Sub-Agent Execution Path

**Date:** 2026-03-01
**Scope:** Sub-agent command pipeline — `tg start`, `tg done`, `tg next`, `tg context`, `tg note`, `tg stats` — and the Dolt DB infrastructure beneath them. Secondary scope: `tg stats` benchmarking system accuracy.
**Produced by:** Performance Architect lead (orchestrator) + 5 parallel scanner sub-agents (schema-profiler, query-auditor, hotpath-tracer, anti-pattern-scanner, dolt-specialist) + pre-compute setup agent.

---

## Benchmark Summary

| Command      | Migrate spawns | Command spawns | Total dolt processes | Wall-time estimate (CLI mode) |
| ------------ | -------------- | -------------- | -------------------- | ----------------------------- |
| `tg next`    | 25             | 1              | **26**               | 2.6–7.8s                      |
| `tg note`    | 25             | 4              | **29**               | 2.9–8.7s                      |
| `tg stats`   | 25             | 4              | **29**               | 2.9–8.7s                      |
| `tg context` | 25             | 5              | **30**               | 3.0–9.0s                      |
| `tg start`   | 25             | 8              | **33**               | 3.3–9.9s                      |
| `tg done`    | 25             | 10             | **35–39**            | 3.5–11.7s                     |

> **Baseline:** Each dolt process spawn = 100–300ms (Go binary startup + noms storage init). A single agent task cycle (`start + context + note + done`) = 127–141 spawns ≈ **13–42 seconds** of process overhead alone.
>
> **Server mode baseline:** mysql2 pool query ≈ 1–5ms. Same cycle in server mode ≈ **0.1–0.7 seconds**. Ratio: **50–200× slower in CLI mode.**

---

## Why It's Slow

### Root cause: execa process-per-query

`src/db/connection.ts:149` — `doltSql()` calls `execa(doltPath(), ["--data-dir", repoPath, "sql", "-q", query, "-r", "json"])` for every SQL statement. No persistent connection, no pooling. This is the fundamental cost multiplier.

The `dolt sql-server` / mysql2 pool path (`doltSqlServer` in `connection.ts`) **already exists and is fully implemented** — it is used in integration tests via `TG_DOLT_SERVER_PORT`. It is not documented or available by default for agent sessions.

### `ensureMigrations` — 25 spawns before any command runs

`src/cli/index.ts:66` invokes `ensureMigrations()` in the `preAction` hook on every CLI command. On a fully-migrated DB, the chain of 17 migration functions still fires **25 sequential `doltSql` calls** just to confirm nothing needs migrating. Detailed breakdown:

| Migration step                          | Spawns (steady state) | Notes                                                                   |
| --------------------------------------- | --------------------- | ----------------------------------------------------------------------- |
| `applyPlanRichFieldsMigration`          | 1                     | `tableExists("project")`                                                |
| `applyTaskDimensionsMigration`          | 2                     | `tableExists("task_domain")` → false → `tableExists("task_doc")` → true |
| `applyTaskSuggestedChangesMigration`    | 1                     | `taskColumnExists("suggested_changes")`                                 |
| `applyTaskDomainSkillJunctionMigration` | 2                     | Same `task_domain`/`task_doc` pair again                                |
| `applyDomainToDocRenameMigration`       | 1                     | `tableExists("task_doc")`                                               |
| `applyTaskAgentMigration`               | 1                     | `taskColumnExists("agent")`                                             |
| `applyHashIdMigration`                  | 1                     | `taskColumnExists("hash_id")`                                           |
| `applyNoDeleteTriggersMigration`        | 2                     | sentinel table + SELECT                                                 |
| `applyGateTableMigration`               | 1                     | `tableExists("gate")`                                                   |
| `applyInitiativeMigration`              | 1                     | `tableExists("initiative")`                                             |
| `applyPlanToProjectRenameMigration`     | 1                     | `tableExists("project")`                                                |
| `applyPlanViewMigration`                | 2                     | `tableExists("project")` + `viewExists("plan")`                         |
| `applyPlanHashIdMigration`              | 1                     | `planColumnExists("hash_id")`                                           |
| `applyDefaultInitiativeMigration`       | **5**                 | 3 existence checks + always-runs UPDATE + nullable check                |
| `applyCycleMigration`                   | 1                     | `tableExists("cycle")`                                                  |
| `applyInitiativeCycleIdMigration`       | 1                     | `columnExists("initiative", "cycle_id")`                                |
| `applyPlanWorktreeMigration`            | 1                     | `tableExists("plan_worktree")`                                          |
| **Total**                               | **25**                |                                                                         |

Notable redundancies: `tableExists("project")` called **4×**, `tableExists("task_domain")` called **2×**, `tableExists("task_doc")` called **3×** — none share results.

`applyDefaultInitiativeMigration` is the worst: it fires an unconditional `UPDATE project SET initiative_id = ... WHERE initiative_id IS NULL` even after the migration is fully applied (no rows match). A write transaction on Dolt's copy-on-write storage for a no-op.

---

## Infrastructure State

| Component                                | State                          | Notes                                                                                                 |
| ---------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| dolt sql-server mode                     | Fully implemented, not default | `TG_DOLT_SERVER_PORT` env var; used in integration tests only                                         |
| `_taskgraph_migrations` sentinel table   | Exists, partially used         | Used only for `applyNoDeleteTriggersMigration`; all other migrations re-check existence every command |
| `event(kind)` index                      | ❌ Missing                     | Primary filter for stats, context, start, done; event table is append-only and grows permanently      |
| `event(task_id, kind, created_at)` index | ❌ Missing                     | Most-executed query pattern across all commands                                                       |
| `task(status)` index                     | ❌ Missing                     | Filter for `tg next` full table scan                                                                  |
| In-process migration cache               | ❌ Missing                     | Migrations re-run on every CLI invocation                                                             |
| `tg stats` correlated subqueries         | Present                        | O(N) sub-scans per done-event row in `elapsedSql`                                                     |
| `tg stats` parallel queries              | ❌ Missing                     | 4 independent queries run sequentially                                                                |
| `tg context` parallel queries            | ❌ Missing                     | `task_doc` and `task_skill` run sequentially                                                          |

---

## Findings — Ranked

### 🔴 Critical

**Finding 1: Process-per-query (26–38 dolt OS spawns per command)**

- Every `doltSql()` call spawns a `dolt` process. At 33 spawns per `tg start`, wall time is 3–10s in CLI mode.
- **Fix:** Enable `dolt sql-server` by default for agent workloads. Add `tg serve` command.

**Finding 2: `ensureMigrations` runs 25 sequential spawns on every command**

- 17 migration functions chain via `.andThen()`, each firing 1–5 `doltSql` calls regardless of state.
- Fix A: Module-level `migrationsDone` in-process flag (run once per process).
- Fix B: Batch all `tableExists`/`columnExists` into 2 queries (`SHOW TABLES` + `COLUMNS`).
- Fix C: Use `_taskgraph_migrations` for all 17 migrations (replaces 25 spawns with 1 lookup).

**Finding 3: `applyDefaultInitiativeMigration` unconditional `UPDATE project` write**

- Fires `UPDATE project SET initiative_id = ... WHERE initiative_id IS NULL` on every command even when no rows match.
- **Fix:** Guard with `SELECT COUNT(*) FROM project WHERE initiative_id IS NULL LIMIT 1`.

### 🟡 Moderate

**Finding 4: No index on `event(kind)` — event table is append-only and grows forever**

- Primary filter for stats, context, start, done. All queries full-scan event table past the FK index.
- **Fix:** New migration adding `CREATE INDEX idx_event_kind ON event(kind)` and composite `(task_id, kind, created_at)`.

**Finding 5: No index on `task(status)` — `tg next` full-scans task table**

- Low-cardinality ENUM; perfect candidate. `tg next` is called before every task.
- **Fix:** New migration adding `CREATE INDEX idx_task_status ON task(status)`.

**Finding 6: `elapsedSql` correlated subqueries — O(N²) growth with event table**

- `src/cli/stats.ts:377–392`: two correlated subqueries per `done` event row scanning the full event table for agent name and start timestamp. At 200 tasks = 400 sub-scans per `tg stats`.
- **Fix:** Rewrite as JOIN/CTE with `ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY created_at DESC)`.

**Finding 7: `tg stats` 4 independent queries run sequentially; `tg context` 5 sequential**

- `stats.ts:420–423`: `tasksDone`, `elapsed`, `review`, `token` — all independent, all `await`ed in sequence.
- `context.ts:77–96`: `task_doc` then `task_skill` — independent, chained.
- **Fix:** `Promise.all` / `ResultAsync.combine`.

**Finding 8: Duplicate event fetch on every `tg done`**

- `getStartedEventBranch` (`utils.ts:69`) and `getStartedEventWorktree` (`utils.ts:113`) both run the same `SELECT body FROM event WHERE task_id=X AND kind='started' ORDER BY created_at DESC LIMIT 1`.
- **Fix:** Fetch once, parse both fields from the single result.

**Finding 9: `checkRunnable` re-fetches `task.status` already loaded by `startOne`**

- `startOne` fetches `{status, hash_id, plan_id}` at `start.ts:137–143`; `checkRunnable` immediately re-fetches `task.status` at `invariants.ts:87–89`.
- **Fix:** Pass status into `checkRunnable` as a parameter.

**Finding 10: `tableExists("project")` 4×, `tableExists("task_domain")` 2×, `tableExists("task_doc")` 3× per command**

- All within one `ensureMigrations` run; none share results.
- **Fix:** In-memory Set from batched `SHOW TABLES` (part of Finding 2 Fix B/C).

**Finding 11: `planTasksSql` Cartesian product on retried tasks**

- `stats.ts:214`: JOIN of `started` × `done` events without DISTINCT/ROW_NUMBER. A task with 2 retries produces 4 rows with wrong elapsed and token totals.
- **Fix:** Add `ROW_NUMBER() OVER (PARTITION BY t.task_id ORDER BY e_done.created_at DESC)` and filter `rn = 1`.

**Finding 12: `tokenSql` groups by `task.owner` ENUM, not agent name**

- `stats.ts:406`: groups by `owner` (ENUM: `human`/`agent`), not by the agent name stored in the `started` event body. All agent types (implementer, reviewer, fixer) conflated.
- **Fix:** Join on `started` events and group by `JSON_EXTRACT(e_start.body, '$.agent')` as in `tasksDoneSql`.

### 🟢 Latent

**Finding 13: `dolt sql-server` mode not documented for production/agent use**

- `TG_DOLT_SERVER_PORT` is the single highest-leverage change but has no entry in `docs/infra.md` or `docs/performance.md`.
- **Fix:** Document in both files; agent sessions should set this by default.

**Finding 14: `CALL DOLT_CHECKOUT` in server mode can bleed branch across pool connections**

- `connection.ts:129`: `CALL DOLT_CHECKOUT(?branch)` sets session state on one pool connection; subsequent queries from other connections in the 10-connection pool won't be on the right branch.
- **Fix:** Use single-connection (non-pool) path for branch-scoped queries, or pin session.

**Finding 15: `tg context` TEXT column fetch before token compaction**

- `suggested_changes TEXT` and `file_tree TEXT` fetched in full even when the token compaction will trim them.
- **Fix:** `LEFT(suggested_changes, 8000)` and `LEFT(file_tree, 8000)` at SQL layer.

---

## Benchmarking Review (`tg stats` system)

| Metric                          | Correctness                                    | Quality                                            |
| ------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| Per-task elapsed (start → done) | ✅ Correct                                     | ⚠️ Correlated subqueries; scales poorly            |
| Agent token self-report         | ⚠️ Groups by `task.owner` ENUM, not agent name | Low — implementer/reviewer/fixer indistinguishable |
| Reviewer pass/fail rate         | ✅ Correct                                     | OK                                                 |
| Plan velocity                   | ✅ Correct                                     | OK                                                 |
| Retried-task elapsed/tokens     | ❌ Cartesian product — wrong numbers           | Incorrect for any task with > 1 start/done pair    |
| CLI process-spawn overhead      | ❌ Not tracked                                 | Largest practical cost; not mentioned in docs      |
| `tg next`/`tg context` latency  | ❌ Not tracked                                 | No per-command timing                              |

`docs/performance.md` accurately covers token cost, hardware specs, and metric interpretation, but does not mention process-spawn overhead or `TG_DOLT_SERVER_PORT` — the two most impactful operational facts for a multi-agent session.

---

## Cross-plan Context (from `/meta` preflight)

The remediation plan shares files with **4 active plans**:

| Active plan                                       | Shared domain/files                                                 | Risk level                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Per-plan Worktree Model (`tg-f6a1ec` doing)       | `src/cli/start.ts`, `src/cli/done.ts`, `migrate.ts` (schema domain) | ⚠️ Medium — Wave 3 fixes to start/done must not conflict with worktree model changes |
| Initiative-Project-Task Hierarchy (9 todo)        | `migrate.ts` (schema domain), `project` table                       | ⚠️ Medium — both add migrations; ordering matters                                    |
| Integration Test Isolation Improvements (blocked) | `bunfig.toml`, test infra                                           | 🟢 Low — server mode docs may help test isolation                                    |
| Gate Full Triage (4 todo)                         | Integration tests must pass after index/query changes               | 🟢 Low — index additions are additive                                                |

Key synergy: `_taskgraph_migrations` sentinel table (already exists for no-delete triggers) can be extended to track all 17 migrations — eliminating the per-command existence checks without any new infrastructure.

---

## Summary

Every CLI command an agent executes pays a **25-spawn tax** just to confirm the DB is already fully migrated, then pays another 5–14 spawns for the actual work — totalling 3–10+ seconds per command in CLI mode. The fix is already built into the codebase: `dolt sql-server` + mysql2 pool mode cuts this by 50–200× but is documented nowhere and off by default. The second highest-priority fix is caching the migration result in-process (run once per process lifetime, not once per command). The `tg stats` benchmarking system is correct for elapsed time and pass/fail rates, but produces wrong numbers for retried tasks and cannot distinguish agent types in token summaries — both fixable with one-line SQL changes.

---

## Recommendations (ordered by impact)

1. **Document `TG_DOLT_SERVER_PORT` in `docs/infra.md` and `docs/performance.md`** — immediate, no code changes
2. **Add `tg serve` command** to start/manage a local `dolt sql-server` lifecycle — eliminates 50–200× process spawn cost
3. **Fix `CALL DOLT_CHECKOUT` + pool connection bleeding** — required before `tg serve` is safe for branch-based workflows
4. **Add in-process `migrationsDone` cache** in `src/cli/index.ts` — run migrations once per process; eliminates 25 spawns on every command after first
5. **Guard `applyDefaultInitiativeMigration` UPDATE behind NULL-count check** — stop writing to `project` table on every command invocation
6. **Use `_taskgraph_migrations` for all 17 migrations** — replaces per-migration existence checks with single versioned lookup
7. **Add `event(kind)` and `event(task_id, kind, created_at)` composite indexes** — covers the most-executed query pattern
8. **Add `task(status)` index** — speeds up `tg next` runnable computation
9. **Rewrite `elapsedSql` as JOIN/CTE** — fixes O(N²) stats growth
10. **Fix `planTasksSql` Cartesian product** — correct elapsed/tokens for retried tasks
11. **Fix `tokenSql` agent grouping** — group by agent name, not owner ENUM
12. **Parallelize `tg stats` 4 queries and `tg context` task_doc/task_skill** — `Promise.all` / `ResultAsync.combine`
13. **Merge duplicate started-event fetch in `tg done`** — one query instead of two
14. **Pass task status into `checkRunnable`** — eliminate redundant SELECT in `tg start`
15. **Truncate TEXT columns at SQL layer in `tg context`** — avoid large `suggested_changes`/`file_tree` fetch before compaction
