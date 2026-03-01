---
name: Stale Task Auto-Recovery
overview: |
  Add a self-healing mechanism that resets orphaned doing tasks back to todo
  after a configurable idle period (default 2h). Stale-task detection already
  exists in status.ts; this plan adds a tg recover command, wires auto-recovery
  into tg next, and adds an integration test.
fileTree: |
  src/
  ├── domain/
  │   └── invariants.ts         (modify)
  └── cli/
      ├── recover.ts            (create)
      ├── next.ts               (modify)
      └── index.ts              (modify)
  __tests__/
  └── integration/
      └── recover.test.ts       (create)
  docs/
  └── cli-reference.md          (modify)
risks:
  - description: Adding doing→todo transition could be misused by regular tg start flow
    severity: low
    mitigation: Only recoverCommand calls the transition; tg start uses checkRunnable which only allows todo→doing
  - description: Auto-recovery in tg next could reset a task that is legitimately slow
    severity: low
    mitigation: Default 2h threshold is generous; configurable via --threshold flag on tg recover
tests:
  - "tg recover resets a task stuck in doing for longer than threshold back to todo"
  - "tg recover leaves alone a task doing for less than threshold"
  - "--dry-run shows candidates without modifying task status"
todos:
  - id: recover-core
    content: "Add doing→todo recovery transition; create src/cli/recover.ts + register tg recover command"
    intent: |
      1. In src/domain/invariants.ts checkValidTransition, add 'todo' to the valid
         transitions from 'doing': doing: ["done", "blocked", "canceled", "todo"].
         Add inline comment: // recovery path — stale/orphaned task reset

      2. Create src/cli/recover.ts with:
         a) Exported recoverStaleTasks(repoPath: string, thresholdHours: number):
            ResultAsync<Array<{task_id, hash_id, title, age_hours}>, AppError>
            - Imports fetchStaleDoingTasks from './status'
            - For each stale task: query(repoPath).update('task', {status:'todo', updated_at:now()}, {task_id})
            - Inserts a note event with body {type:'recovery', age_hours, agent:'system', timestamp: now()}
              Use randomUUID from 'node:crypto' or whatever uuid helper exists (grep src/ for 'randomUUID')
            - Returns the list of recovered tasks
         b) recoverCommand(program: Command) registering 'tg recover':
            - --threshold <hours> option (default '2', validate > 0)
            - --dry-run flag
            - dry-run: call fetchStaleDoingTasks, print table of candidates, print "Dry run — no changes made"
            - normal run: call recoverStaleTasks, print table of recovered tasks or "No stale tasks found"
            - Table columns: Id (hash_id), Title (truncated), Age (hours)
            Use boxen + cli-table3 matching the style used in src/cli/done.ts or status.ts

      3. In src/cli/index.ts, import recoverCommand and call it (alongside other commands).

      Do NOT touch docs/ files.
    agent: implementer
    changeType: create
    suggestedChanges: |
      // invariants.ts
      doing: ["done", "blocked", "canceled", "todo"],  // todo = recovery path

      // recover.ts skeleton
      import { fetchStaleDoingTasks } from './status'
      import { query, now } from '../db/query'
      import { randomUUID } from 'node:crypto'
      export function recoverStaleTasks(repoPath, thresholdHours) { ... }
      export function recoverCommand(program) { program.command('recover')... }

      // index.ts
      import { recoverCommand } from './recover'
      recoverCommand(program)
    docs: [cli-reference, error-handling]

  - id: recover-next-and-docs
    content: "Auto-recover in tg next; add tg recover to docs/cli-reference.md"
    intent: |
      1. In src/cli/next.ts action handler, after readConfig resolves but before
         the main SQL query, call recoverStaleTasks(config.doltRepoPath, 2).
         If it returns Ok with a non-empty list, print to stderr:
           console.error(`Recovered ${tasks.length} stale task(s) back to todo.`)
         If it returns Err or empty list, continue silently.
         Import: import { recoverStaleTasks } from './recover'

      2. Update docs/cli-reference.md: add a section for tg recover documenting:
         Synopsis: tg recover [--threshold <hours>] [--dry-run]
         - Resets doing tasks idle longer than threshold hours back to todo
         - Records a recovery note event per task
         - --threshold: default 2h, minimum 0
         - --dry-run: preview without making changes
         - Note: tg next auto-calls this with default threshold on every run
    agent: implementer
    changeType: modify
    suggestedChanges: |
      // next.ts — early in action handler, after config resolved:
      const recovered = await recoverStaleTasks(config.doltRepoPath, 2)
      recovered.map(tasks => {
        if (tasks.length > 0) {
          console.error(`Recovered ${tasks.length} stale task(s) back to todo.`)
        }
      })
    blockedBy: [recover-core]
    docs: [cli-reference]

  - id: recover-integration-test
    content: "Integration test for tg recover (3 scenarios)"
    intent: |
      Create __tests__/integration/recover.test.ts covering:

      1. Recovers a task doing longer than threshold:
         - Create plan + task, start it (tg start or direct db insert)
         - Manually UPDATE the most recent 'started' event's created_at to 3 hours ago
           using direct SQL via the test db helper
         - Run tg recover --threshold 1
         - Assert task status = 'todo'
         - Assert a 'note' event exists with JSON body containing type='recovery'

      2. Does not recover a task doing less than threshold:
         - Create plan + task, start it (task just started = created_at = now)
         - Run tg recover --threshold 5 (5h threshold; task is fresh)
         - Assert task status = 'doing' (unchanged)

      3. --dry-run does not change status:
         - Create plan + task, start it
         - Age the started event to 3h ago
         - Run tg recover --threshold 1 --dry-run
         - Assert task status = 'doing' (unchanged)

      Follow patterns from existing files in __tests__/integration/ for
      db setup/teardown, direct SQL helpers, and CLI invocation.
    agent: implementer
    changeType: create
    blockedBy: [recover-core]
    docs: [testing]

  - id: recover-run-full-suite
    content: "Run pnpm gate:full and report pass/fail"
    intent: |
      From the plan worktree, run: pnpm gate:full
      Record the result as evidence: "gate:full passed" or "gate:full failed: <summary>".
      If failures occur, add a tg note with the raw failure output.
    agent: implementer
    changeType: test
    blockedBy: [recover-next-and-docs, recover-integration-test]
isProject: false
---

## Analysis

The stale-task detection query (`fetchStaleDoingTasks`) already exists in `src/cli/status.ts` and is used for display in the status panel. What's missing is the **reset** action — moving stale tasks back to `todo` so they can be picked up again.

The key insight: `doing → todo` is currently not in `checkValidTransition`. Adding it enables the recovery path without affecting normal task flow (since `tg start` uses `checkRunnable` which only accepts `todo → doing`).

## Dependency graph

```
Wave 1 — unblocked:
  └── recover-core (invariants + recover.ts + index.ts)

Wave 2 — both depend on recover-core, run in parallel:
  ├── recover-next-and-docs (tg next auto-recovery + cli-reference.md)
  └── recover-integration-test (3-scenario integration test)

Wave 3 — blocked by both wave 2 tasks:
  └── recover-run-full-suite (gate:full)
```

## Event recording

Recovery events use `kind = 'note'` with a structured body `{type: 'recovery', age_hours, agent: 'system', timestamp}` — the same pattern as heartbeat events. No schema migration required.

<original_prompt>
Add a self-healing ability: if doing tasks have not been updated for 2 hours they get pushed back into the ready (todo) column. Worst case another agent picks the same thing up and we work it out somehow.
</original_prompt>
