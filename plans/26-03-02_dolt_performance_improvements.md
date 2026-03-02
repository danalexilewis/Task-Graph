---
name: Dolt Performance Improvements
overview: Improve Dolt access layer performance with prepared statements, branch-specific pools, server stdio logging, import stats disable, and server mode documentation.
fileTree: |
  src/
  ├── db/
  │   ├── connection.ts         (modify)
  │   └── query.ts              (modify)
  ├── cli/
  │   ├── server.ts             (modify)
  │   ├── import.ts             (modify)
  │   └── start.ts              (modify)
  docs/
  ├── infra.md                  (modify)
  ├── performance.md            (modify)
  └── cli-reference.md          (modify)
  __tests__/
  ├── unit/
  │   └── query-parameterized.test.ts   (create)
  └── integration/
      └── server-branch-pool.test.ts    (create)
risks:
  - description: Parameterized dual-path in query.ts - execa path must receive inline SQL; param SQL must align placeholder count with params array
    severity: medium
    mitigation: Unit tests for insert() and update() verifying placeholder count equals params array length; execa path unchanged and still receives inline SQL
  - description: Branch-specific pool in start --branch path may be threaded incorrectly, causing commits to land on wrong branch
    severity: medium
    mitigation: Integration test verifies task is "doing" on branch pool and "todo" on main pool after start --branch
  - description: SET @@dolt_stats_enable not supported on older Dolt versions
    severity: low
    mitigation: Wrap in orElse to log warning and continue; never fail import on stats disable failure
tests:
  - "unit: insert() and update() in query.ts emit correct ?-placeholder SQL and correct params array"
  - "integration: tg start --branch in server mode - task status 'doing' on branch pool, 'todo' on main pool"
todos:
  - id: server-mode-docs
    content: "Document server mode setup, auto-start mechanism, and performance benefits"
    agent: documenter
    changeType: document
    intent: |
      Update docs/infra.md, docs/performance.md, and docs/cli-reference.md to document:
      - How to activate server mode: run `tg server start`, which writes .taskgraph/tg-server.json and spawns dolt sql-server
      - How detectAndApplyServerPort() in src/cli/index.ts reads tg-server.json on every preAction hook and auto-sets TG_DOLT_SERVER_PORT + TG_DOLT_SERVER_DATABASE
      - Performance difference: execa path costs ~100-200ms per query in process spawn overhead; server mode costs <1ms per query over TCP
      - Recommendation: always use server mode for interactive and agent sessions
      - How to stop with `tg server stop` and check status with `tg server status`
      - The tg-server.log file location (.taskgraph/tg-server.log) where dolt sql-server output is captured
      Do NOT change any source files.

  - id: pool-execute-swap
    content: "Swap pool.query() to pool.execute() in doltSqlServer for binary protocol"
    agent: implementer
    changeType: modify
    intent: |
      In src/db/connection.ts, in doltSqlServer(), change pool.query() to pool.execute() on both the params and no-params branches.
      This switches from the MySQL text protocol to the binary protocol, enabling server-side prepared statement plan caching.
      mysql2's pool.execute() uses ComStmtPrepare on first call and ComStmtExecute on subsequent calls for the same query shape.
      Dolt supports server-side cached prepared statements (since v0.22.0); plan caching is automatic.
      No other files change. No new tests needed -- integration tests already run on server mode.
      Run `pnpm gate` to confirm no regressions.
    suggestedChanges: |
      In doltSqlServer() around the pool.query calls:
        // Before:
        params !== undefined ? pool.query(query, params) : pool.query(query),
        // After:
        params !== undefined ? pool.execute(query, params) : pool.execute(query),

  - id: import-stats-disable
    content: "Disable Dolt statistics collection during tg import in server mode"
    agent: implementer
    changeType: modify
    intent: |
      In src/cli/import.ts, after readConfig() succeeds and before the main import work begins,
      check if server mode is active by calling getServerPool(). If the pool is non-null:
        - Run doltSqlServer("SET @@dolt_stats_enable = 0", pool)
        - This is session-scoped: auto-restores when the connection is returned to the pool
        - Wrap with .orElse() so that failure (e.g. older Dolt) logs a warning and does NOT abort the import
      Dolt 1.51.0+ collects table statistics automatically; disabling it reduces background write overhead
      during heavy import operations with many tasks.
      Run `pnpm gate` to confirm no regressions.
    suggestedChanges: |
      import { doltSqlServer, getServerPool } from "../db/connection";
      import { okAsync } from "neverthrow";

      // After readConfig() in the action handler, before the main import chain:
      const pool = getServerPool();
      if (pool) {
        await doltSqlServer("SET @@dolt_stats_enable = 0", pool).orElse(() => {
          process.stderr.write("Warning: could not disable Dolt stats; continuing import.\n");
          return okAsync([]);
        });
      }

  - id: server-stdio-logfile
    content: "Redirect dolt sql-server output to a log file instead of stdio: ignore"
    agent: implementer
    changeType: modify
    intent: |
      In src/cli/server.ts, in startDoltServerProcess(), the child process is currently spawned
      with stdio: "ignore". This hides startup panics; the only observable signal is
      "did not become ready after N attempts" with no root cause.

      Change:
        1. Before spawn, resolve a log file path at path.join(path.dirname(config.doltRepoPath), "tg-server.log")
           (one level above doltRepoPath, i.e. inside .taskgraph/)
        2. Open an append-mode file descriptor: fs.openSync(logPath, "a")
        3. Spawn with stdio: ["ignore", logFd, logFd] so dolt sql-server stdout/stderr go to the log file
        4. Close the file descriptor after spawn (the child holds its own reference)
        5. Add an "exit" listener on the child: if child.exitCode !== null before the ready-poll completes,
           throw immediately with a message that includes the log file path
        6. Include the log file path in the return value or in tg server status output

      This surfaces startup panics without blocking the parent process (no stdio: "pipe" leak).
    suggestedChanges: |
      import * as fs from "node:fs";
      import * as path from "node:path";

      const logPath = path.join(path.dirname(config.doltRepoPath), "tg-server.log");
      const logFd = fs.openSync(logPath, "a");
      const child = spawn(doltBin, [...serverArgs], {
        stdio: ["ignore", logFd, logFd],
        detached: true,
        cwd: config.doltRepoPath,
      });
      fs.closeSync(logFd);

      // In the ready-poll loop, add early exit on child death:
      child.on("exit", (code) => {
        reject(new Error(`dolt sql-server exited with code ${code}. Check log: ${logPath}`));
      });

  - id: query-parameterized
    content: "Add parameterized insert and update variants to query.ts for server path plan caching"
    agent: implementer
    changeType: modify
    blockedBy: [pool-execute-swap]
    intent: |
      Goal: the hot write queries (INSERT task, INSERT event, UPDATE task, UPDATE project) should use
      ?-placeholder SQL + a params array so that mysql2 sends the same query shape on every call,
      allowing the server to cache the compiled plan.

      Approach (dual path: ? for server, inline SQL for execa):

      1. Add a new helper `doltSqlParam(paramSql, params, repoPath, connectionOptions?)` to
         src/db/connection.ts:
           - If getServerPool() is non-null (server mode): call doltSqlServer(paramSql, pool, params)
             which uses pool.execute(paramSql, params) (prepared statement with ?s)
           - If execa mode: fall back to calling doltSql() with the inline SQL string. The caller
             must also pass the inline SQL for the execa fallback.
         Signature: doltSqlParam(paramSql: string, params: unknown[], inlineSql: string,
                                  repoPath: string, options?: DoltSqlOptions): ResultAsync<any[], AppError>

      2. In src/db/query.ts, update insert() and update() methods:
           - Build BOTH paramSql (with ? placeholders) and inlineSql (using existing formatValue)
           - Call doltSqlParam(paramSql, paramValues, inlineSql, repoPath, connectionOptions)
           - For insert(): "INSERT INTO `t` (`a`,`b`) VALUES (?,?)" + [val1, val2]
           - For update(): "UPDATE `t` SET `a`=?,`b`=? WHERE `c`=?" + [val1, val2, whereVal]

      3. Do NOT change: select(), count(), raw() -- these are lower-frequency or query-cached.
         Add a comment noting they remain inline SQL for now.

      4. Write __tests__/unit/query-parameterized.test.ts:
           - Test insert("task", {status: "doing", task_id: "abc"}) produces the correct
             ?-placeholder SQL and a params array with matching length
           - Test update("task", {status: "done"}, {task_id: "abc"}) same
           - Verify placeholder count equals params array length for each case

      Run `pnpm gate` after changes. All server-mode integration tests should still pass.

  - id: branch-specific-pools
    content: "Replace DOLT_CHECKOUT writes with branch-specific connection pool in start --branch path"
    agent: implementer
    changeType: refactor
    blockedBy: [pool-execute-swap]
    intent: |
      Problem: tg start --branch calls checkoutBranch() which runs CALL DOLT_CHECKOUT(branchName)
      on the shared pool. This mutates a connection's branch context; when it's returned to the
      pool, the next caller may get a connection pointed at the wrong branch.

      The DOLT_CHECKOUT calls in mergeAgentBranchIntoMain() and other merge-admin paths in
      branch.ts are INTENTIONAL and should NOT change -- DoltHub endorses this for admin ops.

      Fix the write path only:

      1. Extend getServerPool() in src/db/connection.ts to accept an optional database override:
           export function getServerPool(database?: string): Pool | null
         When database is provided, compute pool key as getPoolKey(host, port, database).
         The existing poolCache infrastructure handles lazy pool creation.

      2. In src/cli/start.ts, in startOne(), when useBranch is true:
           - After createBranch() succeeds, do NOT call checkoutBranch()
           - Instead: const branchDb = `${process.env.TG_DOLT_SERVER_DATABASE ?? "dolt"}/${branchName}`;
                      const branchPool = getServerPool(branchDb);
           - If branchPool is null (execa mode), fall back to checkoutBranch() as today
           - If branchPool is non-null (server mode): run the UPDATE task, INSERT event, UPDATE project
             calls via doltSqlServer() with the branchPool
           - For doltCommit() on the branch: extend doltCommit() to accept an optional pool argument:
               export function doltCommit(msg, repoPath, noCommit?, pool?): ResultAsync<void, AppError>
             When pool is provided, call DOLT_ADD + DOLT_COMMIT on that pool; otherwise use
             getServerPool() as today.

      3. Execa path: no changes. checkoutBranch() + doltCommit() on the execa path unchanged.

      4. Run `pnpm gate` after changes.

    suggestedChanges: |
      // In connection.ts -- extend getServerPool:
      export function getServerPool(database?: string): Pool | null {
        const port = process.env[SERVER_PORT_ENV];
        if (!port) return null;
        const db = database ?? process.env.TG_DOLT_SERVER_DATABASE ?? "";
        if (db === "") return null;
        const host = process.env[SERVER_HOST_ENV] ?? "127.0.0.1";
        const key = getPoolKey(host, port, db);
        // ... lazy pool creation as before, using db as the database field
      }

      // In commit.ts -- extend doltCommit:
      export function doltCommit(
        msg: string, repoPath: string, noCommit = false, overridePool?: Pool
      ): ResultAsync<void, AppError> {
        const pool = overridePool ?? getServerPool();
        if (pool) { ... }
        // execa path unchanged
      }

  - id: test-branch-pool
    content: "Integration test: branch-specific pool writes correct branch and main pool sees isolation"
    agent: implementer
    changeType: test
    blockedBy: [branch-specific-pools]
    intent: |
      Add __tests__/integration/server-branch-pool.test.ts.

      Requires server mode (skip suite with test.skip when TG_DOLT_SERVER_PORT is not set).
      Use the existing test-utils.ts infrastructure for server setup and teardown.

      Test cases:
        1. Create a task. Call tg start --branch on it. Verify:
           - The task row on the branch-specific pool shows status "doing"
           - The same task row on the main pool shows status "todo" (branch isolation)
           - The started event has a "branch" field in its body
        2. Cleanup: cancel the task via tg cancel, drop the test branch via dolt branch -d.

      This confirms that the branch-specific pool pattern correctly isolates writes to the branch
      and does not mutate the shared pool's connection context.

  - id: gate-run
    content: "Run full test suite and confirm all optimizations pass"
    agent: implementer
    changeType: modify
    blockedBy:
      [
        server-stdio-logfile,
        import-stats-disable,
        query-parameterized,
        branch-specific-pools,
        test-branch-pool,
      ]
    intent: |
      Run `pnpm gate:full` from the plan worktree.
      Fix any failures — if multiple independent failure clusters exist, note them for investigator dispatch.
      Evidence: "gate:full passed" or summarize failures.
      This is the final validation task for the plan.

isProject: false
---

## Analysis

The report identified seven ranked optimizations. This plan implements items 1–4 plus the stdio fix (a reliability gap discovered during analysis), deferring query batching (#6) and commit reduction (#7) to a follow-up plan (those require more invasive refactoring of sequential `.andThen()` chains across many commands).

**Key finding from analyst**: `tg server start/stop/status` is fully implemented in `src/cli/server.ts` with lifecycle management, TCP polling, and auto-detection on every `preAction` hook. Server mode is production-ready — the gap is documentation, not code. All integration tests already run on server mode via `test-utils.ts`.

**On DOLT_CHECKOUT**: The anti-pattern is narrower than the report suggested. The `options.branch` path in `doltSql()` is dead code (zero callers pass `{ branch: ... }`). The live issue is `checkoutBranch()` in `start.ts` mutating a shared pool connection. The fix targets only that write path; merge-admin DOLT_CHECKOUT calls in `branch.ts` are endorsed by DoltHub for admin operations.

**On parameterization**: Option B (dual path) is correct. A new `doltSqlParam()` helper in `connection.ts` accepts both the `?` SQL and the inline SQL, routing to `pool.execute()` in server mode and to the execa path in CLI mode. Only `insert()` and `update()` are updated — these are the hot write paths that repeat on every `tg start`/`tg done`.

## Dependency Graph

```
Wave 1 (all parallel, no blockers):
  ├── server-mode-docs       (docs only)
  ├── pool-execute-swap      (1-line change in connection.ts)
  ├── import-stats-disable   (3-line change in import.ts)
  └── server-stdio-logfile   (server.ts stdio redirect)

Wave 2 (after pool-execute-swap):
  ├── query-parameterized    (dual-path insert/update in query.ts)
  └── branch-specific-pools  (per-branch pool in start.ts)

Wave 3 (after branch-specific-pools):
  └── test-branch-pool       (integration test)

Wave 4 (after all above):
  └── gate-run               (full suite validation)
```

## Expected Performance Impact

| Command             | Before (execa, ~9 queries) | After (server mode)      |
| ------------------- | -------------------------- | ------------------------ |
| `tg start`          | ~900ms spawn tax           | ~10-30ms TCP round-trips |
| `tg done`           | ~600ms spawn tax           | ~6-15ms TCP round-trips  |
| `tg next`           | ~200ms spawn tax           | ~2-4ms                   |
| `tg status --tasks` | ~500ms spawn tax           | ~5-20ms                  |

These are spawn-tax-only estimates. Actual improvement depends on system; the structural change is complete elimination of per-query `dolt` process startup.

## Open Questions

- Should `tg server start` be recommended in `AGENT.md` for agent sessions? (Out of scope for this plan — add to docs task if desired.)
- Should the branch-specific pool be eagerly closed after `tg done` completes? (Conservative: let the pool expire from poolCache naturally, or add explicit cleanup in `tg done`.)

<original_prompt>
/plan based on @reports/dolt-performance-optimization-2026-03-02.md
</original_prompt>
