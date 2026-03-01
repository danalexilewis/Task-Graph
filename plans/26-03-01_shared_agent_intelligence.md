---
name: Shared Agent Intelligence Layer
overview: Add push-based agent heartbeats and a tg agents command so any agent can fetch all active agents, their phases, and file locks in one O(1) request instead of polling N terminal files.
fileTree: |
  src/
  └── cli/
      ├── agents.ts              (create)
      └── index.ts               (modify — register agentsCommand)
  __tests__/
  └── integration/
      └── agents.test.ts         (create)
  .cursor/
  └── agents/
      └── implementer.md         (modify — heartbeat protocol)
  docs/
  ├── multi-agent.md             (modify — heartbeat convention)
  └── cli-reference.md           (modify — tg agents entry)
risks:
  - description: JSON double-encoding in heartbeat query (body.message is itself JSON-encoded in Dolt note events)
    severity: medium
    mitigation: Follow the existing review-stats query pattern in stats.ts lines 394-402 which already handles double JSON_UNQUOTE/JSON_EXTRACT. Mirror exactly.
  - description: Implementers not emitting heartbeats if template instructions are ambiguous
    severity: medium
    mitigation: Template update includes a literal copy-paste tg note command with explicit JSON shape. Reviewer checks for heartbeat in done evidence.
  - description: plan vs project table name in agents query
    severity: low
    mitigation: Hardcode project table; add tableExists guard consistent with other queries.
tests:
  - "No doing tasks returns { agents: [] } (empty array, not error) — owned by agents-tests"
  - "One doing task with no heartbeat returns agent row with phase null and files [] — owned by agents-tests"
  - "One doing task with heartbeat returns agent row with correct phase and files array — owned by agents-tests"
  - "Two agents on two tasks both appear in output — owned by agents-tests"
  - "Human (non-JSON) output renders table with agent names — owned by agents-tests"
todos:
  - id: heartbeat-convention
    content: "Define heartbeat body convention and update docs/multi-agent.md"
    agent: documenter
    changeType: modify
    docs: ["multi-agent"]
    intent: |
      Document the heartbeat body shape that agents emit via tg note. This convention
      must be defined before the agents.ts command is implemented so the query shape
      is locked in.

      Convention to document:
      - Heartbeats are written as tg note events (kind = "note") with a structured
        body.message object. This reuses the existing "structured note" pattern
        already established by the review-verdict convention (see stats.ts lines
        394-402 and docs/multi-agent.md for the review event pattern).
      - Body shape:
        {
          "message": {
            "type": "heartbeat",
            "agent": "<agent-name>",
            "phase": "start" | "mid-work" | "pre-done",
            "files": ["src/path/to/file.ts", ...]
          },
          "agent": "<agent-name>",
          "timestamp": "<ISO datetime>"
        }
      - The outer agent + timestamp fields match the existing note body convention.
      - The message.type = "heartbeat" discriminator is what tg agents queries on
        (same double JSON_UNQUOTE/JSON_EXTRACT approach as the review event query).

      Add a "Heartbeat Events" section to docs/multi-agent.md covering:
      1. The exact body shape above
      2. The three phase values and when to emit each
      3. The tg note command template agents use to emit heartbeats
      4. A note that tg agents reads this convention — do not change the shape
         without updating agents.ts
  - id: implementer-template
    content: "Update .cursor/agents/implementer.md with heartbeat protocol"
    agent: documenter
    changeType: modify
    docs: ["agent-contract", "multi-agent"]
    intent: |
      Add explicit heartbeat instructions to the implementer template so agents emit
      structured state at three points during task execution. This is what populates
      the data that tg agents reads.

      Three emission points — add to the appropriate steps in the template:

      1. After tg start (Step 1, after cd to worktree):
         emit phase "start" with files = []

      2. Before starting major file changes (Step 3, before touching files):
         emit phase "mid-work" with files = [list of files being changed]

      3. Just before tg done (Step 4, after work is complete):
         emit phase "pre-done" with the final file list

      Template command to add (copy-paste block for agents):
        pnpm tg note <taskId> --msg '{"type":"heartbeat","agent":"<AGENT_NAME>","phase":"<PHASE>","files":["path/to/file.ts"]}' --agent <AGENT_NAME>

      The msg value MUST be valid JSON. List only the primary files being modified,
      not every file read. The files list is what other agents check for conflicts.

      Also update the "Multi-agent coordination" note to reference tg agents as the
      primary way to check active agent status rather than polling terminal files.
  - id: agents-command
    content: "Implement src/cli/agents.ts and register in src/cli/index.ts"
    agent: implementer
    changeType: create
    blockedBy: [heartbeat-convention]
    docs: ["multi-agent", "cli-reference"]
    skill: cli-command-implementation
    intent: |
      Create src/cli/agents.ts implementing the tg agents command. Register it in
      src/cli/index.ts (one import + one call, matching the pattern of other commands).

      The command aggregates all active agents (doing tasks) plus their last heartbeat
      into a single JSON payload. Use ResultAsync.combine for parallel queries,
      following the pattern in stats.ts (two independent queries run concurrently).

      Query 1 — doing tasks with last started event (agent name, started_at):
        SELECT t.task_id, t.hash_id, t.title, p.title AS plan_title,
          e.body AS started_body, e.created_at AS started_at
        FROM task t
        JOIN project p ON t.plan_id = p.plan_id
        LEFT JOIN event e ON e.task_id = t.task_id AND e.kind = 'started'
          AND e.created_at = (SELECT MAX(e2.created_at) FROM event e2
                               WHERE e2.task_id = t.task_id AND e2.kind = 'started')
        WHERE t.status = 'doing' AND p.status != 'abandoned'
        ORDER BY e.created_at DESC

      Query 2 — last heartbeat note per task:
        SELECT e.task_id, e.body AS heartbeat_body, e.created_at AS heartbeat_at
        FROM event e
        WHERE e.kind = 'note'
          AND JSON_UNQUOTE(JSON_EXTRACT(
                JSON_UNQUOTE(JSON_EXTRACT(e.body, '$.message')), '$.type'
              )) = 'heartbeat'
          AND e.created_at = (
            SELECT MAX(e2.created_at) FROM event e2
            WHERE e2.task_id = e.task_id AND e2.kind = 'note'
            AND JSON_UNQUOTE(JSON_EXTRACT(
                  JSON_UNQUOTE(JSON_EXTRACT(e2.body, '$.message')), '$.type'
                )) = 'heartbeat'
          )

      IMPORTANT — Dolt JSON gotcha: note events store body as a JSON column.
      The message field itself may be a JSON string needing double-decode.
      Use the same double JSON_UNQUOTE/JSON_EXTRACT pattern as stats.ts lines 394-402.

      Merge in TypeScript: build Map<task_id, heartbeatRow> from query 2, then
      enrich each doing-task row. If no heartbeat exists, default phase = null,
      files = [].

      JSON output shape:
        {
          "agents": [
            {
              "agent": "implementer-1",
              "task_id": "...",
              "hash_id": "tg-xxx",
              "task_title": "...",
              "plan_title": "...",
              "phase": "mid-work" | null,
              "files": ["src/cli/note.ts"],
              "started_at": "2026-03-01 12:00:00",
              "last_heartbeat_at": "2026-03-01 12:34:56" | null
            }
          ]
        }

      Human output: renderTable with headers [Agent, Task, Plan, Phase, Files, Started].
      Use boxedSection("Active Agents", ...) wrapper. flexColumnIndex on Task column.
      Files column: join array with ", " or show "—" if empty.

      CLI flags: --json (JSON mode), --plan <planId> (filter to one plan, optional).

      Registration in index.ts: add import agentsCommand from "./agents.js" and
      program.addCommand(agentsCommand) near the other multi-agent commands (e.g.
      near note, stats).
  - id: cli-reference-update
    content: "Update docs/cli-reference.md with tg agents entry"
    agent: documenter
    changeType: modify
    blockedBy: [agents-command]
    docs: ["cli-reference"]
    intent: |
      Add the tg agents command to docs/cli-reference.md under a "Multi-agent" or
      "Coordination" section. Include:
      - Command signature: tg agents [--json] [--plan <planId>]
      - What it returns (active agents, phases, file locks)
      - Output shape (JSON mode)
      - Human output description (table)
      - Example output snippet

      Follow the doc style of existing entries in cli-reference.md (heading level,
      options table, example block).
  - id: agents-tests
    content: "Create __tests__/integration/agents.test.ts"
    agent: implementer
    changeType: create
    blockedBy: [agents-command]
    docs: ["testing"]
    skill: integration-testing
    intent: |
      Create integration tests for the tg agents command. Mirror the structure of
      __tests__/integration/agent-stats.test.ts exactly:
      - describe.serial wrapper
      - setupIntegrationTest() / teardownIntegrationTest() from test-utils.ts
      - Seed state via direct DB insertion (q.insert) — no CLI round-trips for setup
      - runTgCli("agents --json", context.tempDir) for the command under test
      - Parse JSON and assert on shape

      Test cases (all 5):
      1. No doing tasks: result.agents is an empty array
      2. One doing task, no heartbeat: agent row present, phase === null, files === []
      3. One doing task with heartbeat note: agent row has correct phase and files from
         the heartbeat body
      4. Two doing tasks, two different agents: both appear in agents array; file sets
         are independently correct
      5. Human (non-JSON) output: run without --json flag; output contains agent name
         string and task title string (renderTable check)

      Seeding pattern for heartbeat note:
        await q.insert("event", {
          event_id: uuidv4(),
          task_id: taskId,
          kind: "note",
          body: jsonObj({
            message: JSON.stringify({
              type: "heartbeat",
              agent: "implementer-1",
              phase: "mid-work",
              files: ["src/cli/note.ts"]
            }),
            agent: "implementer-1",
            timestamp: toDatetime(new Date())
          }),
          actor: "implementer-1",
          created_at: toDatetime(new Date())
        })

      Note: message must be stringified (JSON string inside the outer JSON object),
      matching the double-encoding pattern that the agents query uses for decoding.
isProject: false
---

## Analysis

The current multi-agent coordination model is O(N): to avoid file conflicts, an agent must read all other agents' terminal files, parse raw stdout, and infer state. This is fragile and doesn't scale as parallelism increases.

The insight is that the task graph DB is already the shared persistence layer. Events already carry structured JSON bodies. The `started` event already stores agent name and worktree path. The `note` event already carries an arbitrary `body.message` payload — and `stats.ts` already queries for note events with a specific `message.type` discriminator (the review verdict pattern).

This plan extends that existing pattern: agents emit `type: "heartbeat"` note events at key transitions, and `tg agents` aggregates them into a single O(1) query. No new schema migration is needed. No background watcher process. Just two SQL queries run in parallel, merged in TypeScript.

The design decision to avoid a new `event.kind = "heartbeat"` ENUM value (and the associated ALTER TABLE migration) was deliberate. The existing "structured note" convention is proven, the query pattern exists in `stats.ts`, and eliminating the migration removes one class of risk (Dolt ENUM ALTER idempotency, sentinel naming bugs).

## Dependency graph

```
Parallel start (3 unblocked):
  ├── heartbeat-convention   (define body shape in docs/multi-agent.md)
  ├── implementer-template   (add heartbeat protocol to implementer.md)
  └── [agents-command blocked on heartbeat-convention]

After heartbeat-convention:
  └── agents-command         (implement src/cli/agents.ts + register)

After agents-command (parallel):
  ├── cli-reference-update   (document tg agents in cli-reference.md)
  └── agents-tests           (integration tests)
```

Wave 1 (parallel): `heartbeat-convention`, `implementer-template`
Wave 2 (after convention locked): `agents-command`
Wave 3 (after command ships): `cli-reference-update`, `agents-tests`

## Proposed changes

### Heartbeat note emission (from implementer)

```bash
# After tg start:
pnpm tg note <taskId> --msg '{"type":"heartbeat","agent":"implementer-1","phase":"start","files":[]}' --agent implementer-1

# Before modifying files:
pnpm tg note <taskId> --msg '{"type":"heartbeat","agent":"implementer-1","phase":"mid-work","files":["src/cli/agents.ts","src/cli/index.ts"]}' --agent implementer-1

# Before tg done:
pnpm tg note <taskId> --msg '{"type":"heartbeat","agent":"implementer-1","phase":"pre-done","files":["src/cli/agents.ts","src/cli/index.ts"]}' --agent implementer-1
```

### tg agents --json output

```json
{
  "agents": [
    {
      "agent": "implementer-1",
      "task_id": "abc123",
      "hash_id": "tg-a1b2c3",
      "task_title": "Implement src/cli/agents.ts",
      "plan_title": "Shared Agent Intelligence Layer",
      "phase": "mid-work",
      "files": ["src/cli/agents.ts", "src/cli/index.ts"],
      "started_at": "2026-03-01 12:00:00",
      "last_heartbeat_at": "2026-03-01 12:34:56"
    }
  ]
}
```

### File lock conflict check (one fetch, O(1))

```typescript
const { agents } = await runTgCli("agents --json");
const lockedFiles = new Set(agents.flatMap((a) => a.files));
const myFiles = ["src/cli/agents.ts"];
const conflicts = myFiles.filter((f) => lockedFiles.has(f));
if (conflicts.length > 0) {
  await tgNote(taskId, `file conflict detected: ${conflicts.join(", ")}`);
}
```

<original_prompt>
Build a shared agent intelligence layer for multi-agent coordination. Currently agents poll each other's terminal files individually (O(N) reads per coordination decision). The goal is a single shared meta-context store: push-based agent heartbeats written to the task graph DB, a tg agents --json command that aggregates all active agents (tasks, phases, file locks) in one O(1) fetch, file lock registration in heartbeat payloads, and an implementer template update so agents emit heartbeats at the right points.
</original_prompt>
