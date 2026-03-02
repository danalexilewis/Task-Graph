---
name: Dolt Service Hardening and Dashboard Fix
overview: Fix the dashboard Loading hang and harden the Dolt server lifecycle for correctness across macOS, Linux, Docker, and CI environments.
fileTree: |
  src/
  ├── cli/
  │   ├── server.ts              (modify - isServerAlive, stale cleanup, binary validation)
  │   ├── dashboard.ts           (modify - interval error visibility)
  │   └── tui/
  │       └── live-opentui.ts    (modify - timeout constants, setupTerminal race guard, interval errors)
  ├── db/
  │   ├── connection.ts          (modify - pool timeouts, DOLT_CHECKOUT isolation)
  │   └── migrate.ts             (modify - event composite index migration)
  └── cli/
      └── status.ts              (modify - agentMetricsSql O(N) rewrite)
  docs/
  └── infra.md                   (modify - DOLT_PATH, server health semantics)
  __tests__/
  ├── unit/
  │   └── server-alive.test.ts   (create - EPERM/ESRCH/TCP probe unit tests)
  └── integration/
      ├── server-lifecycle.test.ts (modify or create - stale meta cleanup)
      └── event-index.test.ts    (create - index exists after migration)
risks:
  - description: DAL Query Cache plan tasks (tg-e5c491, tg-e774ae) also modify connection.ts; if they land before or during this plan, merge conflicts are possible
    severity: medium
    mitigation: Implementers must read the current state of connection.ts before each edit; keep diffs small and targeted
  - description: Dashboard plan tasks (tg-8d3180 etc.) also modify live-opentui.ts and dashboard.ts
    severity: medium
    mitigation: Implementer reads current file before editing; the timeout constant changes are surgical and merge cleanly
  - description: Adding connectTimeout to mysql2 may break tests that use the pool against a slow CI Dolt startup
    severity: low
    mitigation: Use 5s connectTimeout and 10s acquireTimeout - well above the 300ms TCP poll used in server startup
  - description: agentMetricsSql rewrite must return identical output to the original query
    severity: medium
    mitigation: Implementer verifies output against real DB before shipping; add correctness assertion in integration test
tests:
  - "isServerAlive returns true on EPERM (Linux multi-user), false on ESRCH, and validates via TCP probe - assigned to harden-is-server-alive"
  - "stale tg-server.json is deleted when preAction detects dead PID - assigned to stale-meta-cleanup"
  - "mysql2 pool rejects with timeout error when pointing at wrong port, within connectTimeout window - assigned to mysql2-pool-timeouts"
  - "event composite index idx_event_kind_task_id exists after migration runs - assigned to event-index-migration"
  - "agentMetricsSql rewrite returns same values as original query for same data - assigned to agent-metrics-sql-rewrite"
todos:
  - id: harden-is-server-alive
    content: "Harden isServerAlive: distinguish EPERM from ESRCH and add TCP port probe"
    agent: implementer
    changeType: modify
    intent: |
      Fix two cross-environment bugs in `isServerAlive` in `src/cli/server.ts` (lines 37-43):

      1. **EPERM vs ESRCH**: The current `catch { return false }` conflates ESRCH (process dead)
         with EPERM (process alive but owned by different UID — common in Linux Docker/multi-user).
         Fix: catch the error, check `err.code`. If ESRCH -> return false. If EPERM or no signal
         error at all (process alive) -> proceed to TCP probe.

      2. **TCP probe**: After PID liveness passes, do a quick TCP connect to `meta.port` with a
         500ms timeout to confirm Dolt is actually listening there. Reuse/extract the TCP
         probe pattern from `startDoltServerProcess` polling logic (lines 88-109 in server.ts)
         into a shared `probePort(port, timeoutMs)` utility.

      3. **Async conversion**: `isServerAlive` must become `async isServerAlive(pid, port?)`.
         Update all 4 call sites:
         - `detectAndApplyServerPort` (line ~131)
         - `server start` idempotency check (line ~165)
         - `server stop` poll loop (lines ~226-238)
         - `server status` (line ~263)

      Add unit tests in `__tests__/unit/server-alive.test.ts`:
      - Mock `process.kill` to throw EPERM -> assert probePort is called
      - Mock `process.kill` to throw ESRCH -> assert false returned (no TCP probe)
      - Mock probePort to reject -> assert false returned
      - Mock probePort to resolve -> assert true returned
    suggestedChanges: |
      // in server.ts
      async function isServerAlive(pid: number, port?: number): Promise<boolean> {
        try {
          process.kill(pid, 0);
        } catch (err: unknown) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === 'ESRCH') return false;
          if (code === 'EPERM') {
            // process alive but unowned — fall through to TCP probe
          } else {
            return false;
          }
        }
        // PID is alive; verify it's actually Dolt by probing the port
        if (port == null) return true; // no port info, trust PID
        return probePort(port, 500).then(() => true).catch(() => false);
      }

      async function probePort(port: number, timeoutMs: number): Promise<void> {
        return new Promise((resolve, reject) => {
          const socket = new net.Socket();
          const timer = setTimeout(() => { socket.destroy(); reject(new Error('timeout')); }, timeoutMs);
          socket.connect(port, '127.0.0.1', () => { clearTimeout(timer); socket.destroy(); resolve(); });
          socket.on('error', (e) => { clearTimeout(timer); reject(e); });
        });
      }

  - id: stale-meta-cleanup
    content: "Auto-delete stale tg-server.json in detectAndApplyServerPort when server is dead"
    agent: implementer
    changeType: modify
    blockedBy: [harden-is-server-alive]
    intent: |
      In `detectAndApplyServerPort` (`src/cli/server.ts` lines 126-137):
      After `isServerAlive(meta.pid, meta.port)` returns false, immediately delete the stale
      `tg-server.json` file before returning. Currently the file persists indefinitely until
      `tg server status` or `tg server stop` is run explicitly, causing confusion.

      Use `fs.rmSync(serverMetaPath(configDir), { force: true })` — `force: true` makes it
      a no-op if the file is already gone (safe for concurrent runs).

      Add a short log: `console.error('[tg] Stale server meta removed (server not running)')`.

      Add integration test: write a `tg-server.json` with a dead PID, run any `tg` command,
      assert the file no longer exists afterward.

  - id: opentui-timeout-fix
    content: "Restore OpenTUI import/init timeouts and add setupTerminal hang guard"
    agent: implementer
    changeType: modify
    intent: |
      Three changes to `src/cli/tui/live-opentui.ts`, applied to all 6 run* functions
      (runOpenTUILive, runOpenTUILiveDashboardTasks, runOpenTUILiveDashboardProjects,
      runOpenTUILiveProjects, runOpenTUILiveTasks, runOpenTUILiveInitiatives):

      1. **Restore import timeout**: Change `importTimeoutMs = 300` -> `3000` in all 6 functions.
         The Zig core needs ~3s to load on first call. The memory note says "do not reduce below
         400ms; 400ms caused silent fallback." 300ms guarantees the fallback always runs.

      2. **Restore init timeout**: Change `initTimeoutMs = 350` -> `2000` in all 6 functions.

      3. **setupTerminal() hang guard**: In all 6 functions, the `await renderer.setupTerminal()`
         call has no timeout. If it never resolves, the outer try/catch in dashboard.ts never fires
         and the fallback never runs — user sees "Loading..." forever. Wrap with:
         ```ts
         const SETUP_TIMEOUT_MS = 5000;
         await Promise.race([
           renderer.setupTerminal(),
           new Promise<never>((_, reject) =>
             setTimeout(() => reject(new Error('setupTerminal timeout')), SETUP_TIMEOUT_MS)
           ),
         ]);
         ```
         This makes setupTerminal stalls catchable by the try/catch in dashboard.ts.

      Update `.cursor/memory.md` to correct the stale entry (values were 3000ms/2000ms,
      now restored to those values).

  - id: mysql2-pool-timeouts
    content: "Add connectTimeout and acquireTimeout to mysql2 pool to prevent indefinite hang"
    agent: implementer
    changeType: modify
    intent: |
      In `src/db/connection.ts`, function `getServerPool()` (lines ~74-82), add timeout
      configuration to the mysql2 createPool call:

      ```ts
      const pool = createPool({
        host: '127.0.0.1',
        port: meta.port,
        database: meta.database,
        user: 'root',
        waitForConnections: true,
        connectionLimit: 10,
        connectTimeout: 5000,      // ADD: TCP connect timeout (ms)
        acquireTimeout: 10000,     // ADD: time to wait for a free connection from pool
      });
      ```

      This ensures that if the server is stale or unreachable, queries fail with a timeout
      error rather than hanging the process indefinitely.

      Note: DAL Query Cache plan tasks (tg-e5c491, tg-e774ae) may also modify connection.ts.
      Read the current state of the file carefully before editing. These additions go into
      the pool config object and should not conflict with a caching layer added above doltSql().

      Add a test: instantiate a pool against a port with nothing listening, call a query,
      assert it rejects within connectTimeout + 1s buffer (not hangs).

  - id: dolt-binary-validation
    content: "Validate dolt binary at startup with clear error and document DOLT_PATH"
    agent: implementer
    changeType: modify
    intent: |
      Two changes:

      1. **Binary validation in `src/cli/server.ts`**: In `startDoltServerProcess` (before spawning
         dolt), add a preflight check:
         ```ts
         try {
           await execa(doltPath(), ['--version'], { timeout: 3000 });
         } catch (err) {
           if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
             console.error(
               `[tg] dolt binary not found at "${doltPath()}".\\n` +
               `Install dolt: https://docs.dolthub.com/getting-started/installation\\n` +
               `Or set DOLT_PATH env var to the dolt binary path.`
             );
             process.exit(1);
           }
           throw err;
         }
         ```
         Also add the same check as a lazy first-use guard in `src/db/connection.ts` in the
         execa path of `doltSql()` — wrap the first execa call and surface ENOENT clearly.

      2. **Docs in `docs/infra.md`**: Add a section covering:
         - `DOLT_PATH` env var (overrides the default "dolt" binary location)
         - Dolt installation links for macOS (brew), Linux (install script), Docker
         - `tg server start` / `tg server stop` / `tg server status` usage
         - `tg-server.json` lifecycle (what it is, where it lives, when it is created/deleted)
         - Notes on multi-user/Docker: if Dolt is started by a different UID, use `tg server start`
           from within the same user context or set `TG_DOLT_SERVER_PORT` manually

  - id: dolt-checkout-isolation
    content: "Fix DOLT_CHECKOUT to use a pinned connection in server mode"
    agent: implementer
    changeType: modify
    intent: |
      In `src/db/connection.ts`, function `doltSql()` (lines ~162-183), when `options.branch`
      is set and server mode is active (pool path), the current code makes two separate calls:
      `doltSqlServer("CALL DOLT_CHECKOUT(?)", pool, [branch])` then
      `doltSqlServer(query, pool)`. These go to different connections from the pool — checkout
      happens on connection A, query on connection B. This is a correctness bug under concurrency.

      Fix: when branch is set in server mode, acquire a dedicated connection, run checkout + query
      on that same connection, then release:

      ```ts
      // server mode with branch: pin a single connection
      const conn = await pool.getConnection();
      try {
        await conn.execute('CALL DOLT_CHECKOUT(?)', [branch]);
        const [rows] = await conn.execute(query, params);
        return parseRows(rows);
      } finally {
        conn.release();
      }
      ```

      Use neverthrow ResultAsync to wrap: the entire acquire+execute+release block returns
      ResultAsync<T, AppError>. Map connection errors and query errors to AppError.

      Add integration test to `__tests__/integration/dolt-branch.test.ts`: run two concurrent
      branch-scoped queries (different branches), verify each returns the correct branch data
      with no cross-contamination.

      Note: DAL Query Cache plan tasks may add a caching wrapper around doltSql(). Read the
      current state of connection.ts before editing. This change is to the inner routing
      in doltSql() and should sit beneath any cache layer.

  - id: interval-error-visibility
    content: "Replace silent interval error callbacks with visible error surfacing"
    agent: implementer
    changeType: modify
    intent: |
      In `src/cli/dashboard.ts` (3 fallback renderers) and `src/cli/tui/live-opentui.ts`
      (6 run* functions), the interval refresh callbacks have `() => {}` error handlers.
      When DB queries fail after the first render, the display freezes permanently with no
      indication.

      Replace with a debounced error counter approach:
      - Keep a `consecutiveErrors` counter per interval.
      - On error: increment counter.
      - If counter >= 3: write/render a brief error line in the output (e.g.
        `"[tg] DB refresh error — retrying... (last error: ${e.message})"`)
      - On success: reset counter to 0 and clear any error line.

      For the OpenTUI path (live-opentui.ts), update the rendered `rootBox` content to
      include an error text node when consecutive failures occur, then remove it on recovery.

      For the fallback ansi-diff path (dashboard.ts), append the error line to the
      `write(content + errorLine)` call.

      Note: if Dashboard plan tasks (tg-8d3180 etc.) are actively modifying these files,
      coordinate to avoid conflicts. The changes are additive (no structural rewrites needed).

  - id: event-index-migration
    content: "Add composite event(kind, task_id) index via a new migration step"
    agent: implementer
    changeType: modify
    intent: |
      In `src/db/migrate.ts`, add a new migration function after `applyIndexMigration` in
      `MIGRATION_CHAIN` (currently the last step):

      ```ts
      async function applyEventKindIndex(db: DoltDb): Promise<void> {
        const exists = await indexExists(db, 'event', 'idx_event_kind_task_id');
        if (!exists) {
          await execute(db, 'CREATE INDEX idx_event_kind_task_id ON `event`(kind, task_id)');
        }
      }
      ```

      Append `applyEventKindIndex` to `MIGRATION_CHAIN`. This changes the chain hash
      (MIGRATION_VERSION sentinel), which causes one re-run of the full chain on next
      invocation. This is expected and handled correctly by the sentinel/early-return logic.

      The `agentMetricsSql` outer query `WHERE d.kind = 'done'` and the correlated inner
      lookup `WHERE e2.task_id = d.task_id AND e2.kind = 'started'` both benefit from
      this composite index.

      Add a test in `__tests__/integration/` asserting `idx_event_kind_task_id` exists in
      `information_schema.STATISTICS` after migrations run.

  - id: agent-metrics-sql-rewrite
    content: "Rewrite agentMetricsSql from O(N^2) correlated subquery to O(N) JOIN"
    agent: implementer
    changeType: modify
    blockedBy: [event-index-migration]
    intent: |
      In `src/cli/status.ts` (lines ~253-265), replace the `total_agent_minutes` correlated
      subquery with an O(N) grouped JOIN:

      The current query does a full table scan on `event WHERE kind = 'done'`, then for each
      row runs a correlated subquery scanning `event WHERE task_id = ? AND kind = 'started'`.
      This is O(N * M) and gets progressively slower as the event table grows.

      Replacement using the new composite index (idx_event_kind_task_id):

      ```sql
      SELECT COALESCE(SUM(TIMESTAMPDIFF(SECOND, s.created_at, d.created_at)), 0) / 3600
        AS total_agent_hours
      FROM `event` d
      JOIN (
        SELECT task_id, MAX(created_at) AS created_at
        FROM `event`
        WHERE kind = 'started'
        GROUP BY task_id
      ) s ON s.task_id = d.task_id
      WHERE d.kind = 'done'
      ```

      This does one scan of `event WHERE kind = 'done'` (index seek on composite index)
      and one grouped scan of `event WHERE kind = 'started'` (same index), then a hash join.
      O(N) instead of O(N^2).

      Verify: the rewritten query must return identical results to the original for the same
      dataset. Add an integration test that inserts a known set of started/done events and
      asserts the returned `total_agent_hours` matches the expected value.

      Note: DAL Query Cache plan may add caching for fetchStatusData. This rewrite improves
      first-call latency and matters even when the result is cached, since cache misses hit
      the DB. Coordinate if status.ts has changed.

  - id: integration-tests
    content: "Integration and unit tests for hardened server lifecycle and query correctness"
    agent: implementer
    changeType: create
    blockedBy: [harden-is-server-alive, stale-meta-cleanup, mysql2-pool-timeouts, event-index-migration]
    intent: |
      Consolidate tests that span multiple tasks:

      1. **isServerAlive unit tests** (`__tests__/unit/server-alive.test.ts`):
         - Mock `process.kill` throw ESRCH -> assert false, no TCP probe
         - Mock `process.kill` throw EPERM -> assert probePort called
         - Mock probePort resolve -> assert true
         - Mock probePort reject (timeout) -> assert false

      2. **Stale meta cleanup** (extend or create `__tests__/integration/server-lifecycle.test.ts`):
         - Write a `tg-server.json` with dead PID (e.g. PID 1 — init process on Linux, launchd on mac;
           or spawn a process, get its PID, kill it, then use that PID)
         - Run `pnpm tg status` (or any non-server command)
         - Assert `tg-server.json` no longer exists

      3. **Pool timeout** (unit test, no real Dolt needed):
         - Create a mysql2 pool with `connectTimeout: 100` pointing at a port with nothing listening
         - Call `pool.query('SELECT 1')`
         - Assert the promise rejects within 200ms (not hangs)
         - Confirms the timeout config is picked up correctly

      4. **Event index exists**:
         - Run `ensureMigrations` against a fresh test DB
         - Query `information_schema.STATISTICS WHERE TABLE_NAME='event' AND INDEX_NAME='idx_event_kind_task_id'`
         - Assert one row returned

      5. **agentMetricsSql correctness** (if not already in agent-metrics-sql-rewrite task):
         - Insert known event rows: 2 started events + 2 done events with known timestamps
         - Call the rewritten agentMetricsSql
         - Assert returned total_agent_hours matches expected value

  - id: gate-full
    content: "Run full test suite and verify all fixes pass (gate:full)"
    agent: implementer
    changeType: modify
    blockedBy: [harden-is-server-alive, stale-meta-cleanup, opentui-timeout-fix, mysql2-pool-timeouts, dolt-binary-validation, dolt-checkout-isolation, interval-error-visibility, event-index-migration, agent-metrics-sql-rewrite, integration-tests]
    intent: |
      Run `pnpm gate:full` from the plan worktree and record the result in evidence.
      If any tests fail, create investigator tasks for each failure cluster.
      This task must run from inside the plan worktree (see tg done --merge requirement).

isProject: true
---

## Analysis

This plan addresses two categories of issue discovered via investigation:

**Immediate hang fix (Groups A/C):** The dashboard "Loading..." hang has at least three causes
acting together: (1) OpenTUI import timeout regressed to 300ms, guaranteeing the fallback always
runs; (2) `setupTerminal()` in the fallback path has no timeout guard, so a stall leaves the
display frozen with no catch possible; (3) if the mysql2 pool is pointed at a stale or wrong-port
server (because `isServerAlive` returned a false positive), `pool.query()` hangs forever.

**Cross-environment correctness (Groups B/D):** The server detection logic makes assumptions that
break on Linux. `isServerAlive` conflates `EPERM` (alive, different owner — common in Docker
multi-user) with `ESRCH` (dead). Stale `tg-server.json` is never auto-cleaned after a crash.
The `dolt` binary is not validated, giving opaque `ENOENT` errors on systems without it on PATH.
`DOLT_CHECKOUT` in server mode is not connection-isolated, creating a correctness hazard under
concurrency. The event table has no `kind` index, making the `agentMetricsSql` query O(N^2).

### Dependency graph

```
Wave 1 — all parallel (no blockers):
  ├── harden-is-server-alive    (server.ts: EPERM/ESRCH + TCP probe + async)
  ├── opentui-timeout-fix       (live-opentui.ts: restore 3000ms/2000ms + setupTerminal race)
  ├── mysql2-pool-timeouts      (connection.ts: connectTimeout + acquireTimeout)
  ├── dolt-binary-validation    (server.ts + connection.ts + docs/infra.md)
  ├── dolt-checkout-isolation   (connection.ts: pinned connection for branch queries)
  ├── interval-error-visibility (dashboard.ts + live-opentui.ts: visible error on consecutive failures)
  └── event-index-migration     (migrate.ts: idx_event_kind_task_id)

Wave 2 — after harden-is-server-alive:
  └── stale-meta-cleanup        (server.ts: rmSync in detectAndApplyServerPort)

Wave 2 — after event-index-migration:
  └── agent-metrics-sql-rewrite (status.ts: O(N) JOIN rewrite)

Wave 3 — after wave 1 + wave 2:
  └── integration-tests         (unit + integration coverage for hardened paths)

Wave 4 — after everything:
  └── gate-full
```

### Coordination notes

- **DAL Query Cache plan** (tg-e5c491, tg-e774ae etc.): Not yet started. Those tasks will add a
  caching layer to `connection.ts` and wrap `fetchStatusData` in `status.ts`. Our changes (pool
  timeouts in `connection.ts`, SQL rewrite in `status.ts`) are in different areas of those files
  and merge cleanly — implementers just need to read current file state.
- **Dashboard as primary command plan** (tg-8d3180 etc.): Not yet started. Touches `dashboard.ts`
  and `live-opentui.ts`. Our changes (timeout constants, error handler) are targeted; the dashboard
  plan's structural changes may conflict on `run*` function bodies. Implementers should check for
  recent changes before editing.

### Architectural decisions

- **isServerAlive**: TCP probe is the authoritative liveness check; PID signal is a fast pre-filter
  only. This is the same pattern Dolt uses internally (via `sql-server.info`) and what the existing
  `waitForPort()` function in server.ts already does on startup.
- **DOLT_CHECKOUT isolation**: Connection pinning is the standard mysql2 pattern for session-scoped
  operations. It is safe with a pool (`pool.getConnection()` / `conn.release()`) and does not
  require restructuring the pool architecture.
- **agentMetricsSql**: The grouped JOIN approach (O(N)) is a standard SQL rewrite for correlated
  subquery patterns. No schema change needed; relies only on the new composite index for performance.
- **setupTerminal timeout**: 5s gives OpenTUI a reasonable window; if it takes longer than 5s on
  any supported platform, the fallback renders instead — which is the correct graceful degradation.

<original_prompt>
The user reported that `pnpm tg dashboard` shows "Loading..." and nothing more (hangs indefinitely).
Investigation revealed multiple root causes: OpenTUI timeout regression, missing pool timeouts,
isServerAlive false positives from PID reuse, EPERM/ESRCH conflation on Linux, stale tg-server.json
not auto-cleaned, missing dolt binary validation, DOLT_CHECKOUT not connection-isolated, and
O(N^2) agentMetricsSql query. The user requested a standard cross-environment solution.
</original_prompt>
