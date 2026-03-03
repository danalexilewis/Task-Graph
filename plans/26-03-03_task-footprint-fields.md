---
name: Task footprint fields (started_at, ended_at)
overview: Add denormalized started_at and ended_at columns to the task table, backfill from events (and optionally git), and refactor Agent Hours and stale-doing to use them for cheap queries.
fileTree: |
  src/
  ├── db/
  │   └── migrate.ts              (modify)
  ├── cli/
  │   ├── start.ts                (modify)
  │   ├── done.ts                 (modify)
  │   └── status.ts               (modify)
  docs/
  ├── schema.md                   (modify)
  └── agent-hours-query.md        (modify)
risks:
  - description: Event vs footprint drift if write path skips update
    severity: medium
    mitigation: Footprint written atomically with status change in start/done; events remain source of truth for backfill
  - description: Backfill migration runs heavy event aggregation
    severity: low
    mitigation: Single UPDATE per task; idempotent; event table has idx_event_kind_task_id
tests:
  - "Integration test: tg start sets task.started_at; tg done sets task.ended_at"
  - "Integration test: backfill migration populates footprint for tasks with started+done events"
  - "Unit or integration: Agent Hours query returns same value when footprint populated vs event-derived (regression)"
todos:
  - id: schema-footprint
    content: "Add started_at and ended_at columns to task table (nullable DATETIME)"
    agent: implementer
    changeType: create
    intent: |
      Add idempotent migration in src/db/migrate.ts: applyTaskFootprintMigration.
      Use columnExists(repoPath, "task", "started_at") guard; add both columns in one ALTER if missing.
      Update docs/schema.md task table section.
    suggestedChanges: |
      In migrate.ts, add applyTaskFootprintMigration similar to applyPlanHashIdMigration.
      ALTER TABLE task ADD COLUMN started_at DATETIME NULL, ADD COLUMN ended_at DATETIME NULL.
  - id: write-path-start
    content: "On tg start, set task.started_at = now()"
    agent: implementer
    blockedBy: [schema-footprint]
    changeType: modify
    intent: |
      In src/cli/start.ts, extend the batch UPDATE that sets status='doing' and updated_at to also set started_at = currentTimestamp.
      Use the same raw SQL or q.update path that already touches task. Ensure columnExists is not needed at runtime (migration runs first).
  - id: write-path-done
    content: "On tg done, set task.ended_at = now()"
    agent: implementer
    blockedBy: [schema-footprint]
    changeType: modify
    intent: |
      In src/cli/done.ts, extend the q.update("task", { status: "done", updated_at, ... }) to include ended_at: currentTimestamp.
      The update is at line ~157; add ended_at to the data object.
  - id: backfill-footprint
    content: "Backfill migration: populate started_at/ended_at from event table for existing tasks"
    agent: implementer
    blockedBy: [schema-footprint]
    changeType: create
    intent: |
      Add applyTaskFootprintBackfillMigration. For each task with both kind='started' and kind='done' events:
      - started_at = MAX(event.created_at) WHERE kind='started' AND task_id=?
      - ended_at = MAX(event.created_at) WHERE kind='done' AND task_id=?
      Use same pairing logic as Agent Hours: latest started, latest done, require started_at <= ended_at.
      Single UPDATE per task or batched; idempotent (can re-run for newly added events if needed).
    suggestedChanges: |
      Use a single UPDATE with a subquery joining to a derived table of (task_id, started_at, ended_at) from event aggregation.
      Only update rows where task.started_at IS NULL (avoid overwriting already-populated).
  - id: refactor-agent-hours
    content: "Refactor Agent Hours query to use task.started_at/ended_at"
    agent: implementer
    blockedBy: [backfill-footprint]
    changeType: modify
    intent: |
      In src/cli/status.ts, replace agentMetricsSql subquery for total_agent_hours with:
      SELECT COALESCE(SUM(TIMESTAMPDIFF(SECOND, started_at, ended_at)), 0) / 3600 FROM task WHERE started_at IS NOT NULL AND ended_at IS NOT NULL
      Add COALESCE with event-derived fallback for rows where footprint is NULL (tasks not yet backfilled or done before migration).
      Simpler: use task columns only; no fallback if backfill covers all done tasks.
    suggestedChanges: |
      See docs/agent-hours-query.md for current SQL. New SQL: direct SUM from task.
  - id: refactor-stale-doing
    content: "Refactor fetchStaleDoingTasks to use task.started_at when available"
    agent: implementer
    blockedBy: [backfill-footprint]
    changeType: modify
    intent: |
      In status.ts, fetchStaleDoingTasks or the stale-doing query currently joins to event for started_at.
      When task.started_at exists, use it instead of event join. Reduces event table access.
    domain: [schema, cli]
  - id: update-docs
    content: "Update schema.md and agent-hours-query.md for footprint fields"
    agent: documenter
    blockedBy: [refactor-agent-hours]
    changeType: modify
    intent: |
      docs/schema.md: add started_at, ended_at to task table.
      docs/agent-hours-query.md: document new query using task columns; note event-derived backfill and write path.
  - id: add-tests
    content: "Add integration tests for footprint write path and backfill"
    agent: implementer
    blockedBy: [write-path-start, write-path-done, backfill-footprint]
    changeType: create
    intent: |
      Test 1: tg start sets started_at; tg done sets ended_at (assert via raw query).
      Test 2: Backfill migration populates footprint for tasks with started+done events; Agent Hours matches.
      Test 3: Agent Hours regression — value unchanged for fixture data after refactor.
  - id: run-full-suite
    content: "Run gate:full and record result"
    agent: implementer
    blockedBy: [add-tests, refactor-stale-doing, update-docs]
    changeType: modify
    intent: |
      Run pnpm gate:full from plan worktree. Record evidence: passed or failed with summary.
      On failure: tg note with reason; do not mark done until fixed or escalate.
isProject: true
---

## Analysis

The Agent Hours stat currently derives start/end times from the `event` table via subqueries and joins. This works but requires scanning events for every dashboard load. Adding denormalized `started_at` and `ended_at` columns to `task` makes Agent Hours a simple `SUM(TIMESTAMPDIFF(...))` from `task`, eliminating event joins.

**Source of truth:** Events remain authoritative. The footprint columns are a cache updated on `tg start` and `tg done`, and backfilled from events for historical tasks.

**Git as optional fallback:** The analyst found that git can provide first-commit and merge-commit timestamps for tasks with worktree branches, but task branches are often deleted after merge. Events are the primary backfill source; git backfill is out of scope for this plan (can be a follow-up).

## Dependency graph

```
Wave 1 (parallel):
  └── schema-footprint

Wave 2 (all depend on schema-footprint):
  ├── write-path-start
  ├── write-path-done
  └── backfill-footprint

Wave 3 (depend on backfill-footprint):
  ├── refactor-agent-hours
  └── refactor-stale-doing

Wave 4:
  ├── update-docs (after refactor-agent-hours)
  └── add-tests (after write paths + backfill)

Wave 5:
  └── run-full-suite (after add-tests, refactor-stale-doing, update-docs)
```

## Proposed changes

1. **Schema** — `ALTER TABLE task ADD COLUMN started_at DATETIME NULL, ADD COLUMN ended_at DATETIME NULL`
2. **Write path** — `start.ts` and `done.ts` include footprint in the task UPDATE
3. **Backfill** — One-time migration that aggregates events per task and UPDATEs task rows
4. **Read path** — Agent Hours and stale-doing use `task.started_at` / `task.ended_at` instead of event joins
5. **Cache** — Status cache invalidates on `task` writes; existing `event` invalidation remains for other metrics

## Open questions

- **Git backfill:** Defer to a follow-up plan. Events suffice for all tasks that have `started` and `done` events.
- **Tasks with done but no started:** Backfill can set `ended_at` only; `started_at` stays NULL. Agent Hours already ignores such pairs when using the latest-pair logic.

<original_prompt>
We may need to go through git and calculate start and end times per task and update all tasks with proper footprint fields in tg.
</original_prompt>
