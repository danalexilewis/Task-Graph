---
name: Post-Execution Reporting
overview: |
  Add better reporting after a plan has been executed: token spend and efficiency,
  agent performance and sub-agent improvement signals, and doc improvement suggestions.
  Uses optional token capture on done events and a new tg report command (or report mode).
  Planner-analyst sub-agent was used to gather codebase context before this plan.
fileTree: |
  docs/
    schema.md              (modify)
    cli-reference.md      (modify)
  src/
    cli/
      done.ts              (modify)
      export.ts            (modify)
      report.ts            (create)
    export/
      report.ts            (create)
  __tests__/
    integration/
      report.test.ts       (create)
  src/template/
    .cursor/rules/
      taskgraph-workflow.mdc  (modify)
risks:
  - description: Token data source — CLI has no access to Cursor token counts
    severity: medium
    mitigation: Optional --tokens on tg done (agent or wrapper supplies); report shows N/A when absent
  - description: event.body may be object or string (Dolt driver)
    severity: low
    mitigation: Report aggregation already must parse body; handle both per memory.md
  - description: Doc-suggestions could suggest files that exist but are stale
    severity: low
    mitigation: Output as suggestions only; human reviews before changing docs
tests:
  - 'tg done --tokens ''{"input":100,"output":50}'' stores usage in done event body'
  - "tg report --plan <id> lists done tasks with agent attribution and optional token totals"
  - "tg report with no token data in events still runs and shows N/A for token fields"
  - "Doc suggestions compare task_domain/task_skill to docs/ and docs/skills/ and list gaps"
todos:
  - id: event-body-token-schema
    content: Define optional token/usage fields on done (and started) event body in docs
    intent: |
      Document in docs/schema.md the optional event.body fields for token tracking.
      done: { evidence, checks, timestamp, usage?: { input_tokens?, output_tokens? } } or similar.
      started: already has agent, timestamp; optionally allow usage for session totals.
      No DB migration — JSON body is flexible. Ensure Dolt JSON handling (object vs string) is noted.
    domain: schema
    skill: rule-authoring
    changeType: document
  - id: done-tokens-flag
    content: Add optional --tokens to tg done that merges into done event body
    intent: |
      In src/cli/done.ts, add optional --tokens '<json>' (e.g. {"input":100,"output":50}).
      Parse and merge into the body passed to q.insert("event", { ..., body: jsonObj({ evidence, checks, timestamp, usage }) }).
      Validate JSON; invalid or missing key is optional (no failure). Document in cli-reference.
    blockedBy: [event-body-token-schema]
    domain: cli
    skill: cli-command-implementation
    changeType: modify
    suggestedChanges: |
      done.ts: options.tokens ? JSON.parse(options.tokens) : undefined; merge into event body as usage or input_tokens/output_tokens per schema.
  - id: report-command
    content: Add tg report command for plan-level execution summary
    intent: |
      New command tg report (or tg export report) that accepts --plan <id>.
      Query: plan + tasks (status=done for summary), events (started for agent, done for evidence/tokens).
      Output: plan title; list of done tasks with title, agent (from latest started), evidence snippet, optional token sum per task; totals (task count, tokens if present).
      Human-readable text output; optional --json. Put CLI in src/cli/report.ts, aggregation in src/export/report.ts. See status.ts for event body parsing (handle body as object or string).
    blockedBy: [done-tokens-flag]
    domain: cli
    skill: cli-command-implementation
    changeType: create
    suggestedChanges: |
      report.ts: similar to status.ts, raw query for events join task join plan; group by task; for each task latest started (agent), latest done (evidence, usage); sum usage across tasks.
  - id: report-agent-performance
    content: Add agent performance and sub-agent improvement section to tg report
    intent: |
      Extend report output: per-agent (from started.body.agent) list completed task count and task ids/titles.
      Add a "Sub-agent improvement suggestions" section: heuristics e.g. tasks with many notes, or low evidence length; suggest "Review implementer/reviewer prompts for tasks X, Y."
      No new tables; derive from existing events. Keep suggestions short and actionable.
    blockedBy: [report-command]
    domain: cli
    changeType: modify
  - id: report-doc-suggestions
    content: Add doc improvement suggestions to tg report (domains/skills vs docs)
    intent: |
      From tasks in plan (or done tasks), collect domain and skill slugs (task_domain, task_skill).
      Compare to filesystem: docs/<domain>.md and docs/skills/<skill>.md. List missing or suggest "ensure docs/skills/X.md is up to date for tasks that used skill X."
      Read-only: list suggested docs to add or review. Can be same command tg report --plan <id> with a section "Doc suggestions" or separate tg doc-suggestions.
    blockedBy: [report-command]
    domain: cli
    changeType: create
  - id: report-docs-and-workflow
    content: Update cli-reference, schema, and workflow rule for report and tokens
    intent: |
      docs/cli-reference.md: document tg report (and tg done --tokens). docs/schema.md: already updated in event-body-token-schema; ensure done body convention includes usage.
      If report is part of post-plan flow, add to taskgraph-workflow.mdc: after last task done and tg export markdown, optionally run tg report --plan <id> for summary and suggestions.
    blockedBy: [report-agent-performance, report-doc-suggestions]
    domain: backend
    changeType: document
isProject: false
---

## Analysis

Post-execution reporting gives visibility into what happened after a plan is run: who did what, how much token usage (if provided), and where to improve agents and docs. The planner-analyst sub-agent was dispatched first to gather codebase context; this plan is based on that analysis.

**Relevant context (from planner-analyst):**

- Events: `started` has `{ agent, timestamp }`; `done` has `{ evidence, checks, timestamp }`. No token data today.
- Agent attribution for done tasks = latest `started` event per task. No migration needed to add optional keys to event body.
- Token data must be supplied by caller (e.g. `tg done --tokens '...'`); CLI has no access to Cursor usage.
- Doc suggestions can be derived from task_domain / task_skill vs existing `docs/` and `docs/skills/` files.

## Proposed approach

1. **Schema** — Document optional `usage` (or `input_tokens`/`output_tokens`) on `done` (and optionally `started`) in docs/schema.md.
2. **Capture** — `tg done --tokens '<json>'` merges into done event body; backward compatible.
3. **Report command** — `tg report --plan <id>` aggregates done tasks, agent per task (from latest started), evidence, and optional token sums; outputs human-readable summary (+ optional --json).
4. **Agent performance** — Report section: per-agent task counts; heuristic "sub-agent improvement" suggestions (e.g. tasks with many notes or thin evidence).
5. **Doc suggestions** — Report section (or separate command): list domains/skills used by tasks vs existing docs; suggest missing or to-review docs.
6. **Docs and workflow** — cli-reference, schema, and workflow rule updated; optionally recommend `tg report` after plan completion.

## Dependency graph

```mermaid
graph TD
  A[event-body-token-schema] --> B[done-tokens-flag]
  B --> C[report-command]
  C --> D[report-agent-performance]
  C --> E[report-doc-suggestions]
  D --> F[report-docs-and-workflow]
  E --> F
```

## Open questions

- Whether to add optional token capture on `tg start` (e.g. session-level input tokens) or only on `done`.
- Whether doc suggestions should be part of `tg report` or a separate `tg doc-suggestions` (or both: report includes a short section; doc-suggestions is detailed).

<original_prompt>
Better reporting after a plan has been executed: token spend and token efficiency; checking over agents' performance and identifying improvements for sub-agents; suggestions for improvements to docs. Create a plan for this. (Planning stage should use the planner-analyst sub-agent.)
</original_prompt>
