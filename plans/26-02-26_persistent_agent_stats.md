---
name: Persistent Agent Stats
overview: Track per-agent performance metrics (completion rate, review pass rate, elapsed time) from event data.
fileTree: |
  src/cli/stats.ts              (create)
  src/cli/index.ts              (modify)
  docs/cli-reference.md         (modify)
  docs/multi-agent.md           (modify)
  __tests__/integration/agent-stats.test.ts (create)
risks:
  - description: Agent names may be inconsistent across sessions
    severity: medium
    mitigation: Document naming convention; stats aggregate by exact agent string
  - description: Event data may not have agent field for older tasks
    severity: low
    mitigation: Filter to events with agent in body; show "unknown" for missing
tests:
  - "tg stats shows per-agent task completion counts"
  - "tg stats shows review pass/fail rate per agent"
  - "tg stats shows average elapsed time per agent"
  - "tg stats --agent filters to specific agent"
  - "tg stats --json outputs structured data"
todos:
  - id: stats-command
    content: "Add tg stats command that derives agent metrics from event data"
    intent: |
      New CLI command: tg stats [--agent <name>] [--plan <planId>] [--json]
      Query the event table to derive per-agent metrics:
      - Tasks completed: COUNT of done events grouped by body.agent
      - Review pass rate: if we add reviewer verdict events, count PASS/FAIL
      - Avg elapsed time: diff between started.created_at and done.created_at per task
      All data is derivable from existing event table - no new schema needed.
    suggestedChanges: |
      SQL for tasks completed per agent:
      SELECT JSON_EXTRACT(body, '$.agent') as agent, COUNT(*) as tasks_done
      FROM event WHERE kind = 'done'
      GROUP BY agent ORDER BY tasks_done DESC

      SQL for avg elapsed time:
      SELECT s.agent, AVG(TIMESTAMPDIFF(SECOND, s.started_at, d.done_at)) as avg_seconds
      FROM (SELECT task_id, JSON_EXTRACT(body, '$.agent') as agent, created_at as started_at FROM event WHERE kind = 'started') s
      JOIN (SELECT task_id, created_at as done_at FROM event WHERE kind = 'done') d ON s.task_id = d.task_id
      GROUP BY s.agent
    changeType: create
    domain: [cli]
    skill: [cli-command-implementation]
  - id: record-review-events
    content: "Add review verdict events to event table for stats tracking"
    intent: |
      When the orchestrator records review results, emit a note event with
      body: { type: 'review', verdict: 'PASS'|'FAIL', reviewer: agent_name, stage: 'spec'|'quality' }.
      This is a convention change in the dispatch rule, not a schema change -
      the event table already supports note events with arbitrary JSON body.
    suggestedChanges: |
      After reviewer completes, orchestrator runs:
      tg note <taskId> --msg '{"type":"review","verdict":"PASS","reviewer":"reviewer-1","stage":"spec"}'
    changeType: modify
    skill: [subagent-dispatch]
  - id: stats-integration-tests
    content: "Integration tests for tg stats with sample event data"
    intent: |
      Create a plan with tasks, simulate started/done events with agent names,
      add review note events. Run tg stats and verify output matches expected metrics.
    blockedBy: [stats-command, record-review-events]
    changeType: test
    skill: [integration-testing]
  - id: stats-update-docs
    content: "Document tg stats command and review event convention"
    intent: |
      Add tg stats to cli-reference.md. Update multi-agent.md with the review
      event convention and how stats can inform dispatch decisions.
    blockedBy: [stats-command]
    changeType: document
    skill: [documentation-sync]
isProject: false
---

## Analysis

Gastown tracks per-agent performance to enable model comparison and data-driven dispatch decisions.
Task-Graph already stores all the raw data needed - the event table has started/done events with
agent names and timestamps. We just need a command to query and aggregate it.

No schema changes required. Everything is derivable from existing event data:

- `started` events have `body.agent` and `created_at`
- `done` events have `created_at`
- Time delta between started and done gives elapsed time
- A new convention for review note events adds pass/fail tracking

## Example output

```
$ tg stats
Agent             Tasks Done  Avg Time   Review Pass Rate
implementer-1     12          4m 32s     83% (10/12)
implementer-2     8           6m 15s     75% (6/8)
implementer-3     5           3m 48s     100% (5/5)
```

<original_prompt>
Track per-agent performance metrics from existing event data,
inspired by Gastown's attribution and model comparison features.
</original_prompt>
