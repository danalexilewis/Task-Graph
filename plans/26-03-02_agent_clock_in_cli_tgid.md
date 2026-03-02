---
name: Agent clock-in and CLI agent-id (tgid)
overview: Add agent session registration (clock-in/clock-out) and require or pass agent short-id (tgid) for CLI use so usage can be attributed and optimized; dashboard status bar reports a reliable agent stat (e.g. clocked-in count) from agent_session.
fileTree: |
  src/
  ├── db/
  │   └── migrate.ts                    (modify – agent_session migration)
  ├── cli/
  │   ├── index.ts                      (modify – root --agent-id, TG_AGENT_ID)
  │   ├── utils.ts                      (modify – rootOpts agentId, read agent context)
  │   ├── start.ts                      (modify – use tgid in body)
  │   ├── done.ts                       (modify – use tgid in body, add body.agent)
  │   ├── note.ts                       (modify – use tgid in body)
  │   ├── clock.ts                      (create – clock-in, clock-out)
  ├── status.ts                     (modify – dashboard footer stat from agent_session)
  └── ...
  __tests__/
  └── integration/
      └── clock.test.ts                 (create)
risks:
  - description: Existing agent scripts and MCP flows break if tgid required too early
    severity: medium
    mitigation: Introduce --agent-id and TG_AGENT_ID as optional first; add config requireAgentId (default false); enforce only when enabled
  - description: Humans forced to pass tgid for read-only commands
    severity: low
    mitigation: Require tgid only for write/agent commands (start, done, note); read-only commands work without tgid
tests:
  - "Integration test: clock-in returns tgid; clock-out closes session; tg start/done/note with TG_AGENT_ID persist body.agent_id"
  - "Unit or integration: migration creates agent_session; idempotent"
  - "Dashboard footer shows reliable agent stat (e.g. Active agents clocked in) from agent_session when table exists"
todos:
  - id: agent-session-schema
    content: Add agent_session table and idempotent migration (tgid, agent_name, clocked_in_at, clocked_out_at)
    agent: implementer
    intent: |
      Add migration (e.g. applyAgentSessionMigration) to create agent_session table.
      Columns: tgid VARCHAR(16) PRIMARY KEY (format ag-XXXXXX, 6 hex), agent_name VARCHAR(128), clocked_in_at DATETIME NOT NULL, clocked_out_at DATETIME NULL.
      Generate tgid in migration or in app: short unique id (e.g. ag- + 6 hex from crypto). Append to MIGRATION_CHAIN in migrate.ts. Update docs/schema.md with table and conventions.
    suggestedChanges: |
      Add applyAgentSessionMigration to migrate.ts (CREATE TABLE IF NOT EXISTS agent_session ...); append its name to MIGRATION_CHAIN array.
    changeType: create
    docs: [schema]
    skill: dolt-schema-migration
  - id: clock-in-out-commands
    content: Add tg clock-in and tg clock-out subcommands; clock-in returns tgid for env/flag use
    agent: implementer
    blockedBy: [agent-session-schema]
    intent: |
      New file src/cli/clock.ts. clock-in: optional --agent <name> (default "agent"), INSERT into agent_session (tgid, agent_name, clocked_in_at), generate tgid (ag- + 6 hex, ensure unique), print tgid and hint "export TG_AGENT_ID=<tgid>". clock-out: --agent-id <tgid> (required), UPDATE agent_session SET clocked_out_at = now() WHERE tgid = ?. Register commands in index.ts. Both support --json (output tgid, clocked_in_at / clocked_out_at). Escape tgid in SQL.
    suggestedChanges: |
      program.command('clock-in').option('--agent <name>').action(...);
      program.command('clock-out').option('--agent-id <tgid>').action(...);
    changeType: create
    docs: [cli-reference, multi-agent]
    skill: cli-command-implementation
  - id: global-agent-id-opt
    content: Add root --agent-id and TG_AGENT_ID; read in preAction and expose via rootOpts
    agent: implementer
    intent: |
      In index.ts add program.option('--agent-id <tgid>', 'Agent session id from clock-in'). In preAction (or where rootOpts is used), read opts.agentId ?? process.env.TG_AGENT_ID and attach to context passed to commands (or rootOpts returns it). utils.ts: extend rootOpts type and return value to include agentId?: string. Do not require it yet; allow undefined.
    changeType: modify
    docs: [cli-reference, cli]
    skill: cli-command-implementation
  - id: tgid-in-event-bodies
    content: Persist agent_id (tgid) and agent (name) in started, done, note event bodies; fix done writing body.agent
    agent: implementer
    blockedBy: [global-agent-id-opt]
    intent: |
      When global agentId (and optionally agent name) is set, persist in event body. start.ts: body.agent_id = opts.agentId ?? rootOpts(cmd).agentId, body.agent = options.agent ?? 'default' (keep existing). note.ts: same. done.ts: currently does not set body.agent; add body.agent from rootOpts(cmd).agentId context (map tgid to display name from agent_session if desired) or from a --agent fallback, and body.agent_id when present. This fixes status investigator_runs and enables per-tgid metrics. Use existing body shape; add optional agent_id field. See docs/schema.md event body conventions.
    changeType: modify
    docs: [schema, multi-agent, agent-contract]
    skill: taskgraph-lifecycle-execution
  - id: require-agent-id-config
    content: Add config requireAgentId; when true, reject start/done/note if no --agent-id or TG_AGENT_ID
    agent: implementer
    blockedBy: [tgid-in-event-bodies]
    intent: |
      Add optional requireAgentId?: boolean to Config (e.g. in .taskgraph/config.json and Config type in utils.ts). When requireAgentId is true, in start, done, note handlers: if neither --agent-id nor TG_AGENT_ID is set, exit with clear error (e.g. "Agent ID required. Run 'tg clock-in' and set TG_AGENT_ID or pass --agent-id."). When false or unset, behavior unchanged (tgid optional). Document in cli-reference and agent-contract.
    changeType: modify
    docs: [cli-reference, agent-contract]
    skill: cli-command-implementation
  - id: dashboard-footer-agent-stat
    content: Dashboard status bar shows reliable agent stat from agent_session (e.g. Active agents clocked in)
    agent: implementer
    blockedBy: [agent-session-schema]
    intent: |
      In src/cli/status.ts: when agent_session table exists (tableExists), add a query for active clocked-in count: SELECT COUNT(*) AS active_sessions FROM agent_session WHERE clocked_out_at IS NULL. Add activeAgentSessions (or similar) to the agent metrics result and StatusData type. In getDashboardFooterLine and getDashboardFooterContent (Stats box), show a reliable stat e.g. "Active agents (clocked in): N". When agent_session does not exist, omit the row or show 0 so dashboard still works. Update dashboard-format or status tests to expect the new label/value when table exists. See getDashboardFooterContent pairs and agentMetricsSql in status.ts.
    changeType: modify
    docs: [cli-tables, cli-reference]
    skill: cli-command-implementation
  - id: clock-docs-tests
    content: Document clock-in/out, TG_AGENT_ID, requireAgentId; add integration tests for clock and tgid flow
    agent: implementer
    blockedBy: [clock-in-out-commands, tgid-in-event-bodies]
    intent: |
      Update docs/schema.md (agent_session table, event body agent_id). Update docs/cli-reference.md (tg clock-in, tg clock-out, --agent-id, TG_AGENT_ID, requireAgentId). Update docs/multi-agent.md and docs/agent-contract.md (session protocol: clock-in first, set TG_AGENT_ID, then use CLI). Add __tests__/integration/clock.test.ts: clock-in returns tgid; clock-out with that tgid updates row; tg start/done/note with TG_AGENT_ID persist body.agent_id (and body.agent for done). Use runTgCli pattern; temp Dolt repo.
    changeType: create
    docs: [cli-reference, schema, testing]
    skill: documentation-sync, integration-testing
  - id: dashboard-footer-tests
    content: Add or update dashboard/status tests for reliable agent stat (clocked-in count) in footer
    agent: implementer
    blockedBy: [dashboard-footer-agent-stat]
    intent: |
      When agent_session exists and has data, dashboard footer (getDashboardFooterContent / getDashboardFooterBox) must show the reliable stat. Add or update __tests__/cli/dashboard-format.test.ts (or status test) to assert the new label and value (e.g. "Active agents (clocked in)" or similar) when the table is present. Fallback when table missing: no row or 0.
    changeType: modify
    docs: [testing]
    skill: integration-testing
isProject: false
---

# Agent clock-in and CLI agent-id (tgid)

## Analysis

Agents need to register their presence with tg and to identify themselves on every CLI call so that (1) we have a clear "clock in / clock out" session boundary and (2) we can attribute CLI usage to a session and eventually optimize usage patterns. The analyst confirmed that today `body.agent` exists on started and note events but not on done; investigator_runs and per-agent metrics are incomplete. There is no session table yet.

**Decisions:**

- **Session store:** New table `agent_session` (tgid, agent_name, clocked_in_at, clocked_out_at). No new event kinds; event bodies gain optional `agent_id` (tgid).
- **Dashboard:** The status bar / Stats footer in `tg dashboard` and `tg status` will show a **reliable** agent stat from `agent_session` (e.g. "Active agents (clocked in): N" = count of sessions with `clocked_out_at IS NULL`), so orchestrators and humans see how many agents are currently registered.
- **tgid format:** Short CLI-friendly id, e.g. `ag-` + 6 hex chars, generated at clock-in and unique.
- **Human vs agent:** Require tgid only when config `requireAgentId` is true; when not set, all commands work as today (no breaking change). Read-only commands never require tgid.
- **Where to read tgid:** Root option `--agent-id <tgid>` and env `TG_AGENT_ID`; env is convenient for MCP and scripts after clock-in.

**Dependency graph**

```
Parallel start (2 unblocked):
  ├── agent-session-schema   (migration + schema doc)
  └── global-agent-id-opt    (root flag + env + rootOpts)

After agent-session-schema:
  ├── clock-in-out-commands  (tg clock-in, tg clock-out)
  └── dashboard-footer-agent-stat  (status bar reliable stat from agent_session)

After dashboard-footer-agent-stat:
  └── dashboard-footer-tests (assert footer label/value when table exists)

After global-agent-id-opt:
  └── tgid-in-event-bodies   (start/done/note write agent_id and agent)

After tgid-in-event-bodies:
  └── require-agent-id-config (optional enforcement)

After clock-in-out-commands and tgid-in-event-bodies:
  └── clock-docs-tests       (docs + integration tests)
```

## Proposed changes

- **Migration:** One new migration function; table `agent_session` with tgid PK, agent_name, clocked_in_at, clocked_out_at. Idempotent CREATE TABLE IF NOT EXISTS.
- **clock.ts:** Two subcommands; clock-in generates tgid (e.g. from crypto.randomBytes(3).toString('hex') with uniqueness check), inserts row, prints tgid; clock-out updates clocked_out_at.
- **index.ts / utils.ts:** Root `--agent-id` and read `TG_AGENT_ID`; expose via `rootOpts(cmd).agentId`.
- **start/note/done:** When `agentId` is present, set `body.agent_id`. For done, also set `body.agent` (from session or --agent) so status/stats queries work.

## Open questions

- None; enforcement is explicitly optional and gated by config.

## Original prompt

<original_prompt>
we need to have a way of agents registering their exstance with tg. Lets have something like clock in and clock out. so when an agent starts the first thing it needs to do is clock into tg. actually we can make it that the agent needs to provide its short-id as part of its messages to use the cli. that way we could start observing the cli usage patterns and looking to optimise it. but for now it would also force the agent to seek an tgid for it to use with the cli

/plan
</original_prompt>
