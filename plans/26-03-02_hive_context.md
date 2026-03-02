---
name: Hive Context - tg context --hive
overview: Add --hive flag to tg context returning a HiveSnapshot of all active agent activity for hive-awareness at spawn
fileTree: |
  src/
  ├── domain/
  │   └── hive.ts              (create)
  ├── cli/
  │   └── context.ts           (modify)
  __tests__/
  └── integration/
      └── hive-context.test.ts (create)
  docs/
  ├── cli-reference.md         (modify)
  └── multi-agent.md           (modify)
  .cursor/agents/
  └── implementer.md           (modify)
risks:
  - description: Dolt execa semaphore (limit=1) serializes 3 parallel hive queries; ~3-5s at startup
    severity: low
    mitigation: Context is called once per agent spawn, not in a hot loop; server-pool path (mysql2) is unaffected
  - description: JSON_EXTRACT heartbeat detection is Dolt-specific; body shape varies
    severity: low
    mitigation: Copy exact double-decode pattern from agents.ts; non-matching events fall through to recent_notes
tests:
  - "No doing tasks returns empty HiveSnapshot (doing_count=0, tasks=[])"
  - "Doing task with started event populates agent_name and started_at"
  - "Doing task with heartbeat note populates heartbeat_phase and heartbeat_files"
  - "Non-heartbeat note appears in recent_notes"
  - "Heartbeat note is excluded from recent_notes"
todos:
  - id: define-hive-types
    content: Define HiveTaskEntry and HiveSnapshot types in src/domain/hive.ts
    agent: implementer
    changeType: create
    intent: |
      Create src/domain/hive.ts with two exported types:

        export interface HiveTaskEntry {
          task_id: string;
          title: string;
          agent_name: string | null;
          plan_name: string | null;
          change_type: string | null;
          started_at: string | null;       // ISO timestamp
          heartbeat_phase: string | null;  // 'start' | 'mid-work' | 'pre-done' | null
          heartbeat_files: string[];
          recent_notes: Array<{
            body_text: string;
            agent: string | null;
            created_at: string;            // ISO timestamp
          }>;
        }

        export interface HiveSnapshot {
          as_of: string;        // ISO timestamp of when the snapshot was taken
          doing_count: number;
          tasks: HiveTaskEntry[];
        }

      No DB calls — pure type definitions only.
      Export both from the module. Do not barrel-export from domain/index.ts
      unless that file already exists and exports domain types.

  - id: add-context-cli-reference
    content: Add tg context section and --hive stub to docs/cli-reference.md and docs/multi-agent.md
    agent: documenter
    changeType: modify
    intent: |
      docs/cli-reference.md currently has no entry for tg context. Add a section:

        ## tg context

        Output context for one or more tasks. With no IDs, returns all currently
        doing tasks (hive-mind sync). With --hive, returns a HiveSnapshot of all
        active agent activity.

        Usage:
          tg context <taskId>            Single task context (ContextOutput)
          tg context id1 id2 ...         Multiple task contexts (ContextOutput[])
          tg context                     All doing tasks (ContextOutput[])
          tg context --hive              HiveSnapshot of all active agent activity
          tg context --hive --json       Machine-readable HiveSnapshot

        Options:
          --hive    Return a HiveSnapshot instead of ContextOutput. Includes
                    agent names, started timestamps, heartbeat phase, files in
                    progress, and recent notes for each doing task. Advisory only.

      Also add a row to the CLI Additions table in docs/multi-agent.md:
        | tg context --hive | HiveSnapshot of all active agent activity; advisory |

  - id: implement-hive-snapshot
    content: Implement getHiveSnapshot() query function and --hive flag in src/cli/context.ts
    agent: implementer
    changeType: modify
    blockedBy: [define-hive-types]
    docs: [cli, schema]
    intent: |
      Add --hive option to contextCommand() in src/cli/context.ts. When --hive
      is passed, call getHiveSnapshot(config) which:

      1. Queries all doing task IDs first (needed for the IN-list in query 3).

      2. Fires 3 parallel queries via ResultAsync.combine([q1, q2, q3] as const):

         Query 1 — doing tasks + latest started event (agent name, started_at):
           SELECT t.task_id, t.title, p.title AS plan_name, t.change_type,
             e.body AS started_body, e.created_at AS started_at
           FROM `task` t
           JOIN `project` p ON t.plan_id = p.plan_id
           LEFT JOIN `event` e ON e.task_id = t.task_id AND e.kind = 'started'
             AND e.created_at = (
               SELECT MAX(e2.created_at) FROM `event` e2
               WHERE e2.task_id = t.task_id AND e2.kind = 'started'
             )
           WHERE t.status = 'doing' AND p.status != 'abandoned'
           ORDER BY e.created_at DESC

         Query 2 — latest heartbeat note per doing task:
           SELECT e.task_id, e.body AS heartbeat_body, e.created_at AS heartbeat_at
           FROM `event` e
           WHERE e.kind = 'note'
             AND JSON_UNQUOTE(JSON_EXTRACT(
                   JSON_UNQUOTE(JSON_EXTRACT(e.body, '$.message')), '$.type'
                 )) = 'heartbeat'
             AND e.created_at = (
               SELECT MAX(e2.created_at) FROM `event` e2
               WHERE e2.task_id = e.task_id AND e2.kind = 'note'
               AND JSON_UNQUOTE(JSON_EXTRACT(
                     JSON_UNQUOTE(JSON_EXTRACT(e2.body, '$.message')), '$.type'
                   )) = 'heartbeat'
             )

         Query 3 — recent non-heartbeat notes for all doing tasks (last 20):
           SELECT e.task_id, e.body, e.created_at
           FROM `event` e
           WHERE e.kind = 'note'
             AND e.task_id IN (<doing task IDs>)
           ORDER BY e.created_at DESC
           LIMIT 20
           (Filter out heartbeats in TypeScript after fetching)

      3. Zip results by task_id in TypeScript; build HiveSnapshot.

      Dolt JSON quirk: event.body may be string or object.
      Always: const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw

      For started events: extract agent from parsed.agent (string | null).
      For heartbeat: extract parsed.message.phase and parsed.message.files.
      For recent_notes: exclude entries where parsed.message?.type === 'heartbeat';
        take first 3 per task; body_text = truncate to 200 chars of
        (typeof parsed.message === 'string' ? parsed.message : JSON.stringify(parsed.message))

      Return shape:
        HiveSnapshot { as_of: new Date().toISOString(), doing_count, tasks }

      JSON output: { hive: HiveSnapshot, token_estimate: N }
      Human output per task:
        [<agent_name ?? 'unknown'>] <title>
          Plan: <plan_name>  Phase: <heartbeat_phase ?? '—'>
          Files: <heartbeat_files.join(', ') || '—'>
          Started: <started_at ?? '—'>
          Notes: <recent_notes[0].body_text>
                 <recent_notes[1].body_text>

      When no doing tasks: human output "No active agents." ; JSON: empty HiveSnapshot.
      When --hive is passed alongside explicit taskIds, ignore the taskIds
      (--hive is always the full hive view).

    suggestedChanges: |
      Adapt agents.ts for queries 1+2 (lines ~80-145 of src/cli/agents.ts).
      For query 3 IN-list: if no doing tasks, skip query 3 entirely (return []).
      Build a Map<task_id, HiveTaskEntry> from query 1 rows, then enrich with
      query 2 and query 3 results before converting to array.

  - id: update-agent-contract
    content: Update implementer.md spidey sense step and agent-contract docs for --hive
    agent: documenter
    changeType: modify
    blockedBy: [implement-hive-snapshot]
    intent: |
      Three doc updates:

      1. .cursor/agents/implementer.md — "Spidey sense" section:
         Change `tg context --json` (no-args hive call) to `tg context --hive --json`.
         Add: "Returns HiveSnapshot — agent names, phases, files in progress, recent
         notes. Advisory only: note conflicts but do not block on other agents."

      2. docs/agent-contract.md — "General context at start" or equivalent section:
         Update reference to tg context to mention --hive and what it returns.
         One sentence: "Call `tg context --hive --json` to see all active agent
         activity (HiveSnapshot: agent names, heartbeat phases, recent notes) — use
         this to avoid file conflicts and share context."

      3. docs/cli-reference.md — fill in the --hive description that Task B stubbed,
         using the actual JSON shape: { hive: HiveSnapshot, token_estimate: number }.

  - id: hive-context-integration-tests
    content: Write integration tests for tg context --hive
    agent: implementer
    changeType: create
    blockedBy: [implement-hive-snapshot]
    docs: [testing, cli]
    intent: |
      Create __tests__/integration/hive-context.test.ts mirroring the pattern
      in __tests__/integration/context-budget.test.ts.

      Test cases:
      1. No doing tasks → exit code 0; JSON output has doing_count=0, tasks=[]
      2. One doing task with started event (seeded) → tasks[0].agent_name populated
         and tasks[0].started_at is an ISO string
      3. One doing task with a heartbeat note (seeded with body containing
         message.type='heartbeat', message.phase='mid-work', message.files=['a.ts'])
         → tasks[0].heartbeat_phase='mid-work', heartbeat_files=['a.ts']
      4. Non-heartbeat note (body.message='found X') → appears in recent_notes[0]
      5. Heartbeat note does NOT appear in recent_notes

      Seed events using tg CLI (tg start, tg note) or direct insert helper.
      Use setupIntegrationTest() / teardownIntegrationTest() for isolation.

  - id: run-full-suite
    content: Run pnpm gate:full and confirm all tests pass
    agent: implementer
    changeType: modify
    blockedBy: [hive-context-integration-tests]
    intent: |
      Run pnpm gate:full from the plan worktree. Report pass/fail with a summary
      of any failures. Fix any failures introduced by this plan before marking done.
isProject: false
---

## Analysis

The problem is sharp: sub-agents only call `tg context <theirTaskId>` and never see what other agents are doing. The fix has two parts:

1. **CLI**: Add `tg context --hive` that returns a structured `HiveSnapshot` — agent names, heartbeat phases, files in progress, recent notes per doing task. Everything needed is already in the `event` table; no schema changes required.

2. **Agent contract**: Update `.cursor/agents/implementer.md` to replace the no-args `tg context` "spidey sense" call with `tg context --hive --json` so agents orient in the hive at spawn.

The analyst found that `src/cli/agents.ts` is a near-exact template for the two hardest queries (doing tasks + started event, heartbeat detection). Task C adapts those patterns; no novel query logic is needed.

The `--hive` flag approach (over enriching the no-args path) preserves backward compatibility with the existing `ContextOutput[]` shape that agent code and prompts already depend on.

## Dependency graph

```
Parallel start (2 unblocked):
  ├── define-hive-types   (pure types, no DB)
  └── add-context-cli-reference  (docs only, no code)

After define-hive-types:
  └── implement-hive-snapshot  (getHiveSnapshot + --hive flag)

After implement-hive-snapshot:
  ├── update-agent-contract  (doc updates)
  └── hive-context-integration-tests

After hive-context-integration-tests:
  └── run-full-suite
```

## Key patterns (from analyst)

**Query pattern** — copy from `src/cli/agents.ts` ~lines 105–145:

- `ResultAsync.combine([q.raw(sql1), q.raw(sql2), q.raw(sql3)] as const)` — parallel queries
- JSON body double-decode: `JSON_UNQUOTE(JSON_EXTRACT(JSON_UNQUOTE(JSON_EXTRACT(e.body, '$.message')), '$.type'))`
- Dolt body quirk: `typeof raw === 'string' ? JSON.parse(raw) : raw`

**Token budget** — `HiveSnapshot` intentionally omits the heavy `ContextOutput` fields (file_tree, risks, suggested_changes) so it stays small. Recent notes truncated to 200 chars each, max 3 per task.

## Open questions

None — all architectural choices resolved:

- `--hive` flag (not enriched no-args) — analyst recommendation accepted
- New `src/domain/hive.ts` (not extending `token-estimate.ts`) — cleaner separation
- 3 queries (not 1 large JOIN) — matches existing pattern in `agents.ts`

<original_prompt>
sub agents are spawning without activating their spidy sense by fetching all the context rather then just theres specifically. see here

cd /Users/dan/repos/Task-Graph && pnpm tg context afb6c5c2 2>&1 | head -80

> @danalexilewis/taskgraph@3.1.0 tg /Users/dan/repos/Task-Graph
> node dist/cli/index.js context afb6c5c2

Error: Task ID must be a UUID or a hash id (tg-XXXXXX)
ELIFECYCLE Command failed with exit code 1.

What I want to do is call node dist/cli/index.js context

and a snapshot of all currennt agents logs should be provided with other meta data. this gives us hive awareness.

/plan
</original_prompt>
