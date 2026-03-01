---
name: Sub-Agent Execution Performance
overview: Eliminate 26-38 dolt OS process spawns per CLI command and fix query correctness in tg stats benchmarking system.
fileTree: |
  src/
  ├── cli/
  │   ├── index.ts                (modify — in-process migration cache)
  │   ├── serve.ts                (create — tg serve command)
  │   ├── stats.ts                (modify — query rewrites + parallelism)
  │   ├── context.ts              (modify — parallel task_doc/task_skill)
  │   ├── done.ts                 (modify — merge duplicate event fetch)
  │   └── utils.ts                (modify — getStartedEventFull helper)
  ├── db/
  │   ├── connection.ts           (modify — CALL DOLT_CHECKOUT pool fix)
  │   └── migrate.ts              (modify — guard UPDATE, _taskgraph_migrations fast-path, event+task indexes)
  └── domain/
      └── invariants.ts           (modify — checkRunnable status passthrough)
  docs/
  ├── infra.md                    (modify — document TG_DOLT_SERVER_PORT)
  └── performance.md              (modify — link to server mode)
  __tests__/integration/
  ├── agent-stats.test.ts         (modify — update for tokenSql agent name grouping)
  └── stats.test.ts               (modify — add retried-task scenario)
risks:
  - description: ROW_NUMBER window functions require Dolt version supporting MySQL 8 compat
    severity: medium
    mitigation: Integration tests will verify on first run; fallback is MAX(created_at) subquery approach
  - description: tokenSql agent grouping change is a breaking change to tg stats --json output shape
    severity: medium
    mitigation: Update integration tests atomically in the same stats-rewrites task
  - description: Initiative-Project-Task Hierarchy plan also adds migrations to migrate.ts
    severity: low
    mitigation: _taskgraph_migrations fast-path is forward-compatible; each new migration just adds its name to the set
  - description: CALL DOLT_CHECKOUT pool bleeding — branch-scoped queries in server mode could affect correctness
    severity: high
    mitigation: Fix pool connection bleeding (W1-C) before enabling server mode in agent workflows
tests:
  - "tg serve starts dolt sql-server and prints TG_DOLT_SERVER_PORT env snippet"
  - "ensureMigrations runs only once per process lifetime (module-level cache)"
  - "applyDefaultInitiativeMigration does not issue UPDATE when all rows have initiative_id"
  - "elapsedSql returns correct elapsed for tasks with multiple started/done events (retried tasks)"
  - "planTasksSql returns one row per task for retried tasks with correct elapsed"
  - "tokenSql groups by agent name not task.owner ENUM"
  - "tg context runs task_doc and task_skill fetches concurrently"
todos:
  - id: doc-server-mode
    content: "Document TG_DOLT_SERVER_PORT and dolt sql-server mode in docs/infra.md and docs/performance.md"
    agent: documenter
    changeType: document
    docs: [infra, performance]
    skill: documentation-sync
    intent: |
      Add a new "SQL Server Mode" section to docs/infra.md documenting:
      - The five env vars: TG_DOLT_SERVER_PORT, TG_DOLT_SERVER_HOST, TG_DOLT_SERVER_USER, TG_DOLT_SERVER_PASSWORD, TG_DOLT_SERVER_DATABASE
      - How to start a local server: `dolt sql-server --data-dir .taskgraph/dolt --port 3306 --user root`
      - When to use it: any multi-agent session (eliminates 50-200x process spawn cost per query)
      - The full env snippet agents should set
      - Cross-reference from docs/performance.md (which is being written now by tg-a3b3b7) — add a note in performance.md saying "For production multi-agent sessions, enable sql-server mode (see docs/infra.md)"
      Note: docs/performance.md is actively being written by tg-a3b3b7 in the Performance Intelligence plan. Coordinate: add only a server-mode cross-reference paragraph; do not rewrite the whole file.

  - id: tg-serve
    content: "Add tg serve CLI command to start and manage a local dolt sql-server"
    agent: implementer
    changeType: create
    docs: [infra, cli-reference, cli]
    skill: cli-command-implementation
    intent: |
      Create src/cli/serve.ts exporting serveCommand(program: Command).
      Command: `tg serve [--port <port>] [--migrate]`
      Behavior:
        1. Read config via readConfig()
        2. If --migrate flag: run ensureMigrations(doltRepoPath) first
        3. Spawn: dolt sql-server --data-dir <doltRepoPath> [--port <port>] [--user root]
           (follow the dolt sql-server spawn pattern in __tests__/integration/global-setup.ts)
        4. Print env snippet: `export TG_DOLT_SERVER_PORT=<port>`
        5. In --json mode: emit { pid, port, data_dir, env_snippet }
      In src/cli/index.ts:
        - Add "serve" to SKIP_MIGRATE_COMMANDS set (line 34)
        - Add import for serveCommand
        - Register serveCommand(program) after syncCommand
      Port default: 3306 (or first available). Document in docs/infra.md.
      Note: CALL DOLT_CHECKOUT pool bleeding fix (W1-C) must land before this is used for branch workflows — but it is safe for non-branch workflows immediately.
    suggestedChanges: |
      Pattern from __tests__/integration/global-setup.ts:
        const doltServer = execa("dolt", ["sql-server", "--data-dir", doltRepoPath, "--port", port.toString(), "--user", "root"], { detached: true })
      Output JSON shape: { status: "started", pid: number, port: number, data_dir: string, env: { TG_DOLT_SERVER_PORT: string, TG_DOLT_SERVER_DATABASE: string } }

  - id: fix-pool-checkout
    content: "Fix CALL DOLT_CHECKOUT pool connection bleeding in server mode"
    agent: implementer
    changeType: fix
    docs: [infra]
    intent: |
      src/db/connection.ts lines 127-135: when options.branch is set in server mode,
      CALL DOLT_CHECKOUT(?) runs on one pool connection but the subsequent query runs on
      a potentially different pool connection (the checkout set session state that doesn't
      persist across pool connections).

      Fix: acquire a dedicated connection for branch-scoped queries:
        const conn = await pool.getConnection()
        try {
          await conn.query("CALL DOLT_CHECKOUT(?)", [options.branch])
          const [rawRows] = await conn.query(query, params)
          // normalize and return rows
        } finally {
          conn.release()
        }

      The doltSqlServer function can remain unchanged; the fix goes in the runServer()
      closure inside doltSql() where options.branch is checked. Do NOT change the
      doltSqlServer public API.

      No tests exist for this directly — add a brief integration test in
      __tests__/integration/dolt-branch.test.ts that verifies branch-scoped queries
      in server mode return data from the correct branch.
    suggestedChanges: |
      In connection.ts, change:
        if (options?.branch) {
          return doltSqlServer("CALL DOLT_CHECKOUT(?)", pool, [options.branch])
            .andThen(() => doltSqlServer(query, pool));
        }
      To:
        if (options?.branch) {
          return ResultAsync.fromPromise(
            pool.getConnection().then(async (conn) => {
              try {
                await conn.query("CALL DOLT_CHECKOUT(?)", [options.branch]);
                const [rawRows] = await conn.query(query);
                return Array.isArray(rawRows) ? rawRows.map((r: any) => ({ ...r })) : [];
              } finally {
                conn.release();
              }
            }),
            (e) => buildError(ErrorCode.DB_QUERY_FAILED, `Dolt SQL server branch query failed: ${query}`, e),
          );
        }

  - id: migration-cache
    content: "Add in-process migrationsDone flag to skip ensureMigrations on repeat invocations"
    agent: implementer
    changeType: modify
    docs: [infra, schema]
    intent: |
      src/cli/index.ts lines 44-77: the preAction hook calls ensureMigrations() on every
      CLI invocation with no caching. In CLI mode each invocation is a separate process so
      this only helps future long-running processes (like tg serve). But it also documents
      intent and is prerequisite for the _taskgraph_migrations fast-path (wave 2).

      Fix: add module-level flag above createProgram():
        let migrationsDone = false;

      In the preAction hook, before calling ensureMigrations:
        if (migrationsDone) return;

      After ensureMigrations succeeds:
        migrationsDone = true;

      This is safe: CLI mode (one process per command) gets negligible benefit but no cost.
      Server mode and future long-running processes avoid re-running migrations on each request.

  - id: guard-initiative-update
    content: "Guard applyDefaultInitiativeMigration UPDATE behind NULL-count check"
    agent: implementer
    changeType: fix
    docs: [schema]
    skill: dolt-schema-migration
    intent: |
      src/db/migrate.ts lines 467-473: UPDATE project SET initiative_id = '...' WHERE initiative_id IS NULL
      fires unconditionally on every CLI command even when all rows already have initiative_id set.
      This is a no-op write that triggers Dolt's copy-on-write machinery every time.

      Fix: before the UPDATE, add a count check:
        SELECT COUNT(*) as cnt FROM project WHERE initiative_id IS NULL LIMIT 1
      If cnt === 0, skip the UPDATE and the doltCommit that follows.
      The didInsert and didAlter flags already gate the doltCommit — just ensure the UPDATE
      is also skipped when cnt === 0.

      The fix should only add a new doltSql call for the count check; the rest of the function
      logic is preserved. The didInsert/didAlter gating on doltCommit already covers the
      commit skip — just add the UPDATE guard.

  - id: migration-versioning
    content: "Extend _taskgraph_migrations sentinel table to provide fast-path for ensureMigrations"
    agent: implementer
    changeType: modify
    docs: [schema, infra]
    skill: dolt-schema-migration
    intent: |
      src/db/migrate.ts: the _taskgraph_migrations table (lines 205-216) already exists and
      is used for no_delete_triggers. Extend it to track all 17 migrations so ensureMigrations
      can check a single SELECT instead of 25 sequential process spawns.

      Implementation approach:
      1. Define string constants for all 17 migration names (snake_case of migration purpose):
         e.g. const MIGRATION_PLAN_RICH_FIELDS = "plan_rich_fields" etc.
      2. Each existing migration function: after successful DDL application, add:
           .andThen(() => markMigrationApplied(repoPath, MIGRATION_NAME, noCommit))
         where markMigrationApplied uses INSERT IGNORE INTO _taskgraph_migrations.
      3. Add a fast-path preamble to ensureMigrations:
         - First check if _taskgraph_migrations table exists (1 query).
           If not: run full chain (fresh install path).
         - If table exists: SELECT name FROM _taskgraph_migrations WHERE name IN (...17 names...)
         - If count === 17: all migrations applied — return early (0 additional spawns in CLI mode, 1 pool query in server mode).
         - Otherwise: run full chain as before (handles partial/in-progress installs safely).

      Safety: information_schema guards remain in each migration function as the authoritative
      idempotency check. The fast-path is a read optimization only; a partial failure
      (DDL succeeded but INSERT failed) is safe because the next run falls through to the
      per-function guard which detects the DDL already applied and writes the sentinel.

      IMPORTANT: The Initiative-Project-Task Hierarchy plan will also add migrations to this file.
      Document in a code comment: "When adding a new migration to ensureMigrations, add its name
      constant to the fast-path name set in this function."

  - id: event-indexes
    content: "Add event(kind) and event(task_id, kind, created_at) composite indexes via new migration"
    agent: implementer
    changeType: modify
    docs: [schema]
    skill: dolt-schema-migration
    intent: |
      The event table (migrate.ts line 13) has no indexes beyond event_id PK and task_id FK.
      kind is the primary filter for all stats, context, start, done queries.
      event(task_id, kind, created_at) is the most-executed query pattern in the system.
      The event table is append-only and grows permanently.

      Add migration function applyEventIndexMigration after applyPlanWorktreeMigration in the chain.
      Guard with information_schema.STATISTICS:
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event' AND INDEX_NAME = 'idx_event_kind' LIMIT 1
      DDL:
        ALTER TABLE `event`
          ADD INDEX `idx_event_kind` (kind),
          ADD INDEX `idx_event_task_kind_at` (task_id, kind, created_at)
      Commit message: "db: add event(kind) and event(task_id,kind,created_at) indexes"
      Also register the migration name in _taskgraph_migrations (from migration-versioning task).
      Note: if migration-versioning task is not yet complete, just add the function to the chain;
      the _taskgraph_migrations registration can be added in the same PR as migration-versioning.

  - id: task-status-index
    content: "Add task(status) index via new migration"
    agent: implementer
    changeType: modify
    docs: [schema]
    skill: dolt-schema-migration
    intent: |
      The task table (migrate.ts line 11) has no index on status despite it being the primary
      filter for tg next (WHERE status = 'todo'), checkRunnable (NOT IN ('done','canceled')),
      and autoCompletePlanIfDone (GROUP BY status).

      Add migration function applyTaskStatusIndexMigration after applyEventIndexMigration.
      Guard with information_schema.STATISTICS:
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task' AND INDEX_NAME = 'idx_task_status' LIMIT 1
      DDL:
        ALTER TABLE `task` ADD INDEX `idx_task_status` (status)
      Commit message: "db: add task(status) index"

  - id: stats-query-rewrites
    content: "Rewrite tg stats queries: fix elapsedSql correlated subqueries, planTasksSql Cartesian product, tokenSql agent grouping, and parallelize all 4 default queries"
    agent: implementer
    changeType: modify
    docs: [schema, testing]
    skill: integration-testing
    intent: |
      Four changes to src/cli/stats.ts, all in one task (same file):

      1. REWRITE elapsedSql (lines 377-392): replace two correlated subqueries per done-event row
         with a derived-table JOIN that materializes latest started events per task once.
         Use the pattern described in the planner-analyst report (JOIN on MAX(created_at) subquery).
         If Dolt version supports ROW_NUMBER(), use ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY created_at DESC).
         If not (verify in tests), fall back to MAX subquery approach.
         With idx_event_task_kind_at index now present, this becomes efficient.

      2. FIX planTasksSql (lines 214-228): Cartesian product M×N for retried tasks.
         Rewrite using ROW_NUMBER() CTEs (latest started + latest done per task) or MAX subqueries.
         A retried task must produce exactly ONE row with the most-recent elapsed and token values.

      3. FIX tokenSql (lines 405-418): groups by t.owner ENUM ('human'|'agent'), not agent name.
         Change to group by JSON_UNQUOTE(JSON_EXTRACT(e.body, '$.agent')) where e is the done event.
         This is a BREAKING CHANGE to tg stats --json output shape (was "agent"/"human", now agent names).
         Update __tests__/integration/agent-stats.test.ts atomically in this same commit.
         Search __tests__/ for all references to stats --json agent/token output and update them.

      4. PARALLELIZE: Replace sequential awaits at lines 420-423 with Promise.all:
           const [tasksResult, elapsedResult, reviewResult, tokenResult] = await Promise.all([...]);
         Also parallelize planSummarySql + planTasksSql in the --plan branch (lines 230-231).

      Integration tests: add a "retried task" scenario to __tests__/integration/stats.test.ts
      that verifies planTasksSql returns exactly one row with correct elapsed for a task that
      was started, failed (done with verdict FAIL), restarted, and done again.

  - id: context-parallel
    content: "Parallelize task_doc and task_skill queries in tg context"
    agent: implementer
    changeType: modify
    intent: |
      src/cli/context.ts lines 76-96: task_doc is queried, then task_skill is queried in a
      .andThen() chain. These are independent queries both requiring only the resolved task_id.

      Replace with ResultAsync.combine([task_doc_query, task_skill_query]).map(([docRows, skillRows]) => ...)

      The output shape is unchanged; callers see the same result. This change is transparent
      to __tests__/integration/context-budget.test.ts.

  - id: done-merge-fetch
    content: "Merge getStartedEventBranch + getStartedEventWorktree into a single DB fetch in tg done"
    agent: implementer
    changeType: modify
    intent: |
      src/cli/utils.ts: getStartedEventBranch (lines 65-96) and getStartedEventWorktree
      (lines 102-130) both run the identical query:
        SELECT body FROM event WHERE task_id = ? AND kind = 'started' ORDER BY created_at DESC LIMIT 1
      They are both called sequentially in done.ts lines 309-318.

      Fix: add a new exported helper getStartedEventBody(taskId, repoPath):
        ResultAsync<{ branch?: string; worktree_path?: string; worktree_branch?: string;
                      worktree_repo_root?: string; agent?: string } | null, AppError>
      This function runs the query once and parses all fields from the body.

      In done.ts, replace the two sequential calls with one call to getStartedEventBody,
      then derive branch and worktree info from the single result.

      getStartedEventBranch and getStartedEventWorktree can be kept for any external callers
      but should be refactored to delegate to getStartedEventBody internally.

  - id: checkrunnable-passthrough
    content: "Pass task status into checkRunnable from startOne to eliminate redundant SELECT"
    agent: implementer
    changeType: modify
    docs: [schema]
    intent: |
      src/cli/start.ts lines 135-145: startOne fetches task { status, hash_id, plan_id }.
      src/domain/invariants.ts lines 81-133: checkRunnable re-fetches task.status immediately.
      This is a redundant SELECT on every tg start for a todo-status task.

      Fix: add optional parameter `knownStatus?: TaskStatus` to checkRunnable.
      When provided and truthy, skip the initial SELECT task query.
      Call site in startOne: pass currentStatus as the third argument.

      The optional parameter preserves backward compatibility for any callers that don't
      have status pre-fetched. Update __tests__/integration/invariants-db.test.ts to
      verify behavior with and without the knownStatus parameter.
      Update __tests__/domain/invariants.test.ts for unit coverage.

  - id: gate-full
    content: "Run gate:full and verify all changes pass lint, typecheck, and full test suite"
    agent: implementer
    changeType: test
    blockedBy:
      [
        stats-query-rewrites,
        context-parallel,
        done-merge-fetch,
        checkrunnable-passthrough,
        migration-versioning,
        event-indexes,
        task-status-index,
        guard-initiative-update,
      ]
    intent: |
      Run pnpm gate:full from the repo root. All lint, typecheck, and integration tests must pass.
      Pay special attention to:
      - agent-stats.test.ts and stats.test.ts (tokenSql agent name change + retried-task scenario)
      - invariants-db.test.ts (checkRunnable signature change)
      - dolt-branch.test.ts (pool checkout fix)
      - Any test that imports from migrate.ts (migration versioning changes)
      If gate:full fails, identify the cluster of failures, report them, and fix.
      Evidence: "gate:full passed" or "gate:full failed: <summary>"
isProject: false
---

## Analysis

This plan addresses a fundamental architectural constraint: every `tg` CLI command an agent runs spawns **26–38 separate `dolt` OS processes** before completing, because the migration chain alone fires 25 sequential `execa` process spawns (100–300ms each). A single agent task cycle (`start + context + note + done`) costs 127–141 process spawns ≈ 13–42 seconds of pure overhead in CLI mode. The fix is already built into the codebase: `dolt sql-server` + mysql2 pool mode eliminates this at the architecture level and is used in integration tests but not documented or available by default.

**Wave 1** unblocks server mode for production agent workloads. The pool connection bleeding fix (W1-C) must land before server mode is recommended for branch-based workflows. The in-process migration cache (W1-D) is a lightweight fix that pays off even in CLI mode for future long-running processes.

**Wave 2** reduces the steady-state migration overhead for CLI mode (still useful when server mode isn't available): versioned migration tracking replaces 25 existence checks with 1 lookup. The index additions enable all downstream query rewrites to be efficient.

**Wave 3** fixes the query-level issues that remain even in server mode: the `tg stats` correlated subqueries, the retried-task Cartesian product, the wrong agent grouping in token stats, and several unnecessary sequential round-trips across stats, context, and done flows.

## Dependency Graph

```
Wave 1 — Parallel start (4 unblocked):
  ├── doc-server-mode     (docs/infra.md + performance.md)
  ├── tg-serve            (src/cli/serve.ts + index.ts)
  ├── fix-pool-checkout   (src/db/connection.ts)
  └── migration-cache     (src/cli/index.ts)

Wave 2 — All unblocked (can run parallel with Wave 1 or after):
  ├── guard-initiative-update  (migrate.ts: no-op UPDATE fix)
  ├── migration-versioning     (migrate.ts: _taskgraph_migrations fast-path)
  ├── event-indexes            (migrate.ts: event index migration)
  └── task-status-index        (migrate.ts: task status index migration)

Wave 3 — Parallel (unblocked; stats tasks need event-indexes for full benefit but work without):
  ├── stats-query-rewrites  (stats.ts: elapsedSql + planTasksSql + tokenSql + Promise.all)
  ├── context-parallel      (context.ts: ResultAsync.combine)
  ├── done-merge-fetch      (done.ts + utils.ts: single event fetch)
  └── checkrunnable-passthrough (invariants.ts + start.ts: status parameter)

Final:
  └── gate-full (blocked on all Wave 3 + Wave 2 tasks)
```

## Interaction with Active Plans

**Per-plan Worktree Model (tg-f6a1ec, doing):** Touches `start.ts`/`done.ts` docs only — no code conflict with Wave 3 changes.

**Performance Intelligence (tg-a3b3b7, doing):** Writing `docs/performance.md` now. `doc-server-mode` must coordinate — add a server-mode cross-reference paragraph rather than rewriting the whole file.

**Performance Intelligence (tg-0a486d, todo):** "Write integration tests for tg stats --plan and --timeline". This should be run AFTER `stats-query-rewrites` completes so it tests the fixed SQL. The orchestrator should add a cross-plan `blocks` edge from `stats-query-rewrites` to `tg-0a486d`.

**Initiative-Project-Task Hierarchy (9 todo):** Also adds migrations to `migrate.ts`. When those tasks add new migration functions, they must add migration name constants to the `migration-versioning` fast-path set. Add a comment to that effect in the code.

## Open Questions

1. **Dolt ROW_NUMBER() support** — the integration tests will reveal this immediately on `pnpm test:integration`. If unsupported, `stats-query-rewrites` falls back to MAX(created_at) subquery approach (documented in intent).
2. **`tg serve` daemonization** — should the process detach (run as daemon) or block the terminal? First version blocks (simpler, matches developer ergonomics for a local server). Add `--detach` flag in a future task.
3. **Deprecate `getStartedEventBranch` / `getStartedEventWorktree`?** — After `done-merge-fetch` lands, these become thin wrappers. They can be deprecated in a follow-up doc task without blocking anything here.

<original_prompt>
/report and then assess for /meta overlaps and synergies use preflight and dry run analysis to inform this then /plan
</original_prompt>
