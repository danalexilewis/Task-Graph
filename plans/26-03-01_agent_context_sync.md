---
name: Agent Context Sync
overview: New subsystem collecting agent terminal events into a SQLite WAL store, enabling any agent to query a snapshot of parallel agent activity.
fileTree: |
  src/
  ├── agent-context/
  │   ├── db.ts                   (create)
  │   ├── events.ts               (create)
  │   └── collector.ts            (create)
  ├── cli/
  │   ├── agent-context.ts        (create)
  │   └── index.ts                (modify — register new command)
  scripts/
  ├── collect-agent-events.ts     (create)
  └── query-agent-events.ts       (create)
  __tests__/
  └── integration/
      └── agent-context.test.ts   (create)
  docs/
  ├── agent-context.md            (create)
  └── domains.md                  (modify — add agent-context row)
  .gitignore                      (modify — exclude agent_context.db + WAL sidecars)
risks:
  - description: bun:sqlite is not available in the Node CLI binary (dist/). Collector and query reader must be standalone Bun scripts, not imported into the compiled CLI.
    severity: high
    mitigation: CLI commands spawn bun sub-processes for scripts/collect-agent-events.ts and scripts/query-agent-events.ts. No direct import of bun:sqlite in src/.
  - description: Collector polling may miss events if a terminal file is replaced rather than appended (Cursor could rotate files).
    severity: low
    mitigation: Track (inode, offset) per file. Reset offset if inode changes between polls.
  - description: Test isolation — collector writes to agent_context.db; tests must not touch the production db path.
    severity: medium
    mitigation: All test fixtures use fs.mkdtempSync paths. Collector and query scripts accept --db flag (default .taskgraph/agent_context.db; overridable in tests).
tests:
  - "Collector inserts [tg:event] lines from terminal files into agent_events table — owned by integration-tests"
  - "Collector ignores non-[tg:event] lines — owned by integration-tests"
  - "Collector picks up new events added after startup (offset tracking) — owned by integration-tests"
  - "query-agent-events.ts --since <ts> returns only events after the cursor — owned by integration-tests"
  - "parseEventLine returns Err for malformed JSON after [tg:event] marker — owned by schema-and-event-types (unit)"
todos:
  - id: schema-and-event-types
    content: "Create src/agent-context/db.ts and src/agent-context/events.ts"
    agent: implementer
    changeType: create
    intent: |
      Create the two foundational modules for the agent-context subsystem.

      **src/agent-context/events.ts**
      - Define `EventKind` union: `"tg_start" | "tg_done" | "tg_note" | "file_write" | "search" | "custom"`
      - Define `AgentEvent` interface:
        ```typescript
        interface AgentEvent {
          id: string;        // nanoid or crypto.randomUUID()
          agent: string;     // agent identifier (from --agent flag or env)
          parent?: string;   // id of previous event from same agent (linked list)
          taskId?: string;
          kind: EventKind;
          payload: Record<string, unknown>;
          ts: number;        // Unix ms
        }
        ```
      - Export `parseEventLine(line: string): Result<AgentEvent, AppError>` — looks for `[tg:event] ` prefix, JSON.parses remainder, validates shape.
      - Unit tests inline or in __tests__/unit/agent-context/events.test.ts.

      **src/agent-context/db.ts**
      - Export `openDb(dbPath: string): Database` using `bun:sqlite` (this module is ONLY imported by Bun scripts, never by the Node CLI binary — add a comment to this effect).
      - Export `ensureSchema(db: Database): void` — idempotent `CREATE TABLE IF NOT EXISTS agent_events (...)` + 3 indexes as designed.
      - Export `insertEvent(db: Database, event: AgentEvent): Result<void, AppError>` using `Result.fromThrowable`.
      - Export `queryEvents(db: Database, opts: { since?: number; agentId?: string; taskId?: string; limit?: number }): Result<AgentEvent[], AppError>`.

      Follow the project's `Result<T, AppError>` / neverthrow pattern. No raw try/catch at module boundary. Use `buildError(ErrorCode.DB_QUERY_FAILED, ...)` for SQLite errors.

  - id: gitignore-and-config
    content: "Exclude agent_context.db from git; add optional config key"
    agent: implementer
    changeType: modify
    intent: |
      Two small changes, independent of all other tasks:

      1. **`.gitignore`**: Add entries for the SQLite database and its WAL/SHM sidecar files:
         ```
         .taskgraph/agent_context.db
         .taskgraph/agent_context.db-wal
         .taskgraph/agent_context.db-shm
         ```

      2. **Config schema** (`src/config/` or wherever `readConfig()` is defined): Add an optional `agentContextDbPath?: string` field. Default value: `.taskgraph/agent_context.db` (relative to repo root). Update the config type and the Zod schema (or equivalent runtime validator) if one exists.

      No new packages needed. No tests required for this task.

  - id: collector-core
    content: "Create src/agent-context/collector.ts and scripts/collect-agent-events.ts"
    agent: implementer
    blockedBy: [schema-and-event-types]
    changeType: create
    intent: |
      **src/agent-context/collector.ts** — the polling engine.

      Core type:
      ```typescript
      interface CollectorOpts {
        terminalsDir: string;   // path to .cursor/projects/.../terminals/
        dbPath: string;
        pollIntervalMs?: number; // default 500
        agentId?: string;        // override agent label (default: "collector")
      }
      ```

      Implementation:
      - `run(opts: CollectorOpts): Promise<void>` — starts polling loop, handles SIGINT/SIGTERM for graceful shutdown.
      - Maintain `offsets: Map<string, { offset: number; inode: number }>` — read only new bytes since last poll.
      - On each tick: `readdir(terminalsDir)`, stat each `.txt` file, detect inode change (reset offset if changed), read new bytes, scan for lines matching `/^\[tg:event\] /`, call `parseEventLine`, call `insertEvent`.
      - Log to stdout: `[collector] Inserted event kind=${kind} agent=${agent} ts=${ts}` for each successful insert.
      - The `--dir` flag default is auto-detected from `.cursor/projects/` directory structure; also accept explicit override.
      - Graceful stop: on SIGINT/SIGTERM, flush current tick, write `--- collector stopped ---` to stdout, exit 0.

      **scripts/collect-agent-events.ts** — Bun entry point.
      - Parse CLI args: `--dir <terminalsDir>`, `--db <dbPath>`, `--interval <ms>`, `--agent <id>`.
      - Call `readConfig()` for defaults where applicable.
      - Call `ensureSchema(db)` on startup.
      - Call `run(opts)`.
      - Print `[collector] Started. Watching ${terminalsDir}` to stdout on startup.

      Uses `node:fs/promises` for file I/O — no new packages.

  - id: query-script
    content: "Create scripts/query-agent-events.ts"
    agent: implementer
    blockedBy: [schema-and-event-types]
    changeType: create
    intent: |
      **scripts/query-agent-events.ts** — Bun one-shot reader, outputs JSON to stdout.

      CLI args:
      - `--db <path>` — path to agent_context.db (default from config)
      - `--since <ts>` — Unix ms cursor; only return events after this timestamp
      - `--agent <id>` — filter by agent
      - `--task <id>` — filter by taskId
      - `--limit <n>` — default 100
      - `--format json|table` — default json

      Output (json mode): `{ "agent_events": AgentEvent[] }` — one JSON object on stdout.
      Output (table mode): human-readable table via console.table or a simple aligned format.

      Calls `openDb`, `ensureSchema` (idempotent — safe to call on read-only usage), `queryEvents`.
      On error: writes `{ "error": "..." }` to stdout, exits 1.

      No new packages.

  - id: cli-commands
    content: "Create src/cli/agent-context.ts and register tg agent-context subcommands"
    agent: implementer
    blockedBy: [collector-core, query-script]
    changeType: create
    intent: |
      **src/cli/agent-context.ts** — three subcommands under `tg agent-context`:

      1. **`tg agent-context collect`**
         - Spawns `bun scripts/collect-agent-events.ts` with appropriate flags derived from `readConfig()`.
         - Foreground: pipes stdout/stderr to the terminal so the agent can observe it via terminal-file polling.
         - Prints startup message so the operator knows what directory is being watched.

      2. **`tg agent-context query`**
         - Spawns `bun scripts/query-agent-events.ts` with flags from CLI args (`--since`, `--agent`, `--task`, `--limit`).
         - Captures stdout, parses JSON, outputs via `renderTable` (human mode) or raw JSON (`--json` flag).
         - Follows the project's both-modes rule: always support `--json` flag.

      3. **`tg agent-context status`**
         - One-shot: shows count of events per agent in the last 5 minutes, and the most recent event per agent.
         - Uses `queryEvents` via query script subprocess.

      **src/cli/index.ts**
      - Register the `agent-context` command group. Follow the same pattern as other multi-subcommand groups in the CLI (e.g. how `tg status` vs `tg status --tasks` vs `tg status --projects` is structured — or if there's a subcommand registry pattern, use it).

      Error handling: wrap subprocess errors in `AppError` and use the CLI's standard error printer.

  - id: integration-tests
    content: "Create __tests__/integration/agent-context.test.ts"
    agent: implementer
    blockedBy: [collector-core, query-script]
    changeType: create
    intent: |
      Integration tests for the collector and query reader.

      **Setup pattern** (mirrors existing integration test harness):
      ```typescript
      let tmpDir: string;
      let terminalsDir: string;
      let dbPath: string;
      let collectorProc: ChildProcess;

      beforeAll(async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-agent-context-"));
        terminalsDir = path.join(tmpDir, "terminals");
        dbPath = path.join(tmpDir, "agent_context.db");
        fs.mkdirSync(terminalsDir);
        collectorProc = spawn("bun", [
          "scripts/collect-agent-events.ts",
          "--dir", terminalsDir,
          "--db", dbPath,
          "--interval", "100"
        ], { stdio: "pipe" });
        // wait for "[collector] Started" on stdout before proceeding
      });

      afterAll(async () => {
        collectorProc.kill("SIGTERM");
        fs.rmSync(tmpDir, { recursive: true });
      });
      ```

      **Tests (describe.serial required):**
      1. Collector inserts a `[tg:event]` line written to a terminal file — poll db until event appears, assert kind/agent/taskId match.
      2. Collector ignores non-`[tg:event]` lines — write noise, wait 2 poll cycles, assert row count = 0.
      3. Offset tracking — write 3 events, wait, write 3 more; assert total 6 rows (not re-reading old content).
      4. Multiple files — two terminal files, each with different agents; assert both agents appear in db.
      5. Query reader `--since` filter — insert 5 events at ts=1000,2000,...5000; query `--since 3000`; assert 2 results.

      Use bounded poll helper (max 20 retries × 100ms). Never flat `sleep(N)`.
      Use `stdio: "pipe"` on collector spawn (not "ignore") to capture panics.
      Follow `describe.serial` rule from testing.md.

  - id: domain-doc
    content: "Create docs/agent-context.md and update docs/domains.md"
    agent: documenter
    blockedBy: [cli-commands]
    changeType: create
    intent: |
      Write the domain doc for the new agent-context subsystem.

      **docs/agent-context.md**
      - Purpose: what this domain owns (SQLite event store, collector, query API) and what it does NOT own (Dolt task graph, terminal file creation — that's Cursor).
      - Triggers frontmatter: files glob `src/agent-context/**`, change_types `["create","modify"]`, keywords `["agent_events","collector","tg:event"]`.
      - Key sections: schema (agent_events table), event line format (`[tg:event] {...}`), collector lifecycle, query API, decisions/gotchas (bun:sqlite isolation, polling vs FSEvents choice, no-daemon rationale).
      - Related projects: "Agent Context Sync".

      **docs/domains.md**
      - Add row: `agent-context` | `docs/agent-context.md` | "SQLite event store for cross-agent state visibility".
isProject: false
---

## Analysis

The write side is free — Cursor already streams every shell command to `.cursor/projects/.../terminals/<pid>.txt` as a base platform feature. Agents that want structured events emit `[tg:event] {"kind":"...","taskId":"...","ts":...}` lines to stdout; the collector picks these up without any change to agent dispatch logic.

The central store is a SQLite WAL file (`.taskgraph/agent_context.db`) separate from Dolt. Dolt is the version-controlled planning audit trail; `agent_context.db` is ephemeral operational telemetry — mixing them would pollute the commit history and create an impedance mismatch on write throughput.

**Critical constraint**: `bun:sqlite` is a Bun built-in, not a Node module. The compiled CLI binary runs under Node 20. To avoid native compilation or a new npm package, the collector and query reader are standalone Bun scripts. The CLI commands in `src/cli/agent-context.ts` spawn them as subprocesses — the same pattern as how the Dolt server is managed today. No new `package.json` dependencies required.

The collector is a foreground long-running process (not a daemon). No PID-file locking, no service manager — just a process you start in a terminal and monitor via the existing terminal-file polling pattern.

## Dependency graph

```
Parallel start (2 unblocked):
  ├── schema-and-event-types   (db.ts + events.ts — SQLite schema + event parsing)
  └── gitignore-and-config     (.gitignore entries + config key)

After schema-and-event-types (2 parallel):
  ├── collector-core           (collector.ts + scripts/collect-agent-events.ts)
  └── query-script             (scripts/query-agent-events.ts)

After collector-core + query-script:
  └── cli-commands             (src/cli/agent-context.ts + index.ts registration)

After collector-core + query-script (parallel with cli-commands):
  └── integration-tests        (__tests__/integration/agent-context.test.ts)

After cli-commands:
  └── domain-doc               (docs/agent-context.md + docs/domains.md)
```

## Proposed event line format

Agents emit to stdout (no code change needed for existing agents — this is opt-in for richer observability):

```
[tg:event] {"kind":"tg_start","taskId":"abc-123","agent":"implementer","ts":1740859200000}
[tg:event] {"kind":"file_write","taskId":"abc-123","agent":"implementer","payload":{"path":"src/foo.ts"},"ts":1740859201000}
[tg:event] {"kind":"tg_done","taskId":"abc-123","agent":"implementer","ts":1740859260000}
```

## Open questions

1. **Auto-detect terminals dir**: The path `.cursor/projects/<hash>/terminals/` includes a project hash. The collector needs to discover this. Options: (a) read from a known env var Cursor sets, (b) glob `.cursor/projects/*/terminals/`, (c) require explicit `--dir` flag. Option (b) is simplest; if there are multiple projects the collector watches all of them.

2. **Agent identity**: The `agent` field in an event needs to come from somewhere. In current agent output there is no structured `AGENT_ID` env var. Best approach: the collector derives `agent` from the terminal filename (PID) and stores it as `"pid:<pid>"` unless a `[tg:event]` line includes an explicit `"agent"` field.

<original_prompt>
Build a plan for the Agent Context Sync feature discussed in conversation. The goal is cross-agent state visibility via:

1. The existing Cursor terminal-file pattern (write side — already free, no agent changes needed).
2. Structured [tg:event] JSON-line markers agents emit to stdout for richer events.
3. A SQLite WAL central store (.taskgraph/agent_context.db).
4. A polling collector process that tails terminal files and inserts events.
5. A query API (bun scripts) for agents to get a system snapshot.
   Key constraint: bun:sqlite cannot be imported in the Node CLI binary — use Bun subprocess scripts.
   </original_prompt>
