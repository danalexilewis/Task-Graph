---
name: Multi-Agent Centaur Support
overview: >
  Make Task-Graph safe and productive for 1-3 simultaneous agents working
  alongside the human. Add claim/presence tracking so agents see each other's
  work, auto-migrate the schema so no agent ever guesses wrong, surface
  "doing" activity in tg status, and update agent directives so orientation
  includes awareness of other active work. Keep centaur: human plans, audits,
  and routes; agents execute with shared visibility.
fileTree: |
  tools/taskgraph/src/db/migrate.ts            (modify)
  tools/taskgraph/src/cli/start.ts             (modify)
  tools/taskgraph/src/cli/status.ts            (modify)
  tools/taskgraph/src/cli/note.ts              (create)
  tools/taskgraph/src/cli/index.ts             (modify)
  tools/taskgraph/src/cli/context.ts           (modify)
  tools/taskgraph/src/domain/types.ts          (modify)
  tools/taskgraph/src/domain/errors.ts         (modify)
  docs/schema.md                               (modify)
  docs/architecture.md                         (modify)
  docs/cli-reference.md                        (modify)
  docs/agent-contract.md                       (modify)
  docs/multi-agent.md                          (create)
  AGENT.md                                     (modify)
  .cursor/rules/taskgraph-workflow.mdc         (modify)
  .cursor/rules/session-start.mdc              (modify)
  .cursor/rules/multi-agent.mdc                (create)
  tools/taskgraph/__tests__/integration/       (modify)
risks:
  - description: "tg start --agent writes to the same Dolt DB from parallel processes; concurrent dolt sql calls could conflict"
    severity: medium
    mitigation: "Dolt single-writer is already sequential via execa; keep writes short and idempotent. Add retry on DB_QUERY_FAILED for transient lock errors."
  - description: "Adding agent_id to event body is a schema-less change (JSON), but querying it in status requires consistent structure"
    severity: low
    mitigation: "Use Zod validation on event body read-back; treat missing agent_id as 'unknown'."
  - description: "Auto-migrate on every command adds latency"
    severity: low
    mitigation: "Migration checks are cheap (information_schema SELECT); only ALTER runs on first use."
tests:
  - "Integration: tg start --agent alice records agent_id in started event body"
  - "Integration: tg status shows doing tasks with agent_id and plan title"
  - "Integration: tg note <taskId> creates a note event retrievable via tg show"
  - "Integration: tg start fails with TASK_ALREADY_CLAIMED when task is already doing"
  - "Integration: auto-migrate runs idempotently when commands detect missing tables"
  - "Unit: status query correctly groups doing tasks by agent"
todos:
  - id: auto-migrate-on-command
    content: "Add ensureMigrations() that runs all idempotent migrations; call it at the start of every CLI command via shared preAction hook"
    domain: [schema, cli]
    skill: [dolt-schema-migration, cli-command-implementation]
    changeType: modify
    intent: >
      Eliminate the "two worlds" problem. Every tg command auto-applies pending
      migrations before executing. Agents never encounter a stale schema.
    suggestedChanges: |
      In cli/index.ts, add program.hook('preAction') that calls readConfig()
      then ensureMigrations(config.doltRepoPath). ensureMigrations chains all
      idempotent migration functions from db/migrate.ts.

  - id: agent-id-on-start
    content: "Add --agent <name> option to tg start; record agent_id in the started event body JSON"
    blockedBy: [auto-migrate-on-command]
    domain: [cli, schema]
    skill: [cli-command-implementation, neverthrow-error-handling]
    changeType: modify
    intent: >
      Give each agent session a durable identity stamp. When agent A starts a
      task, the event records who claimed it, so other agents (and the human)
      can see ownership.
    suggestedChanges: |
      start.ts: add .option('--agent <name>', 'Agent identifier').
      Write agent_id into event body: jsonObj({ agent: options.agent ?? 'default', timestamp }).
      Also store agent_id in a new task column or keep it JSON-only (prefer JSON-only to avoid migration).

  - id: claim-guard-on-start
    content: "Reject tg start if task is already doing (TASK_ALREADY_CLAIMED error) unless --force is passed"
    blockedBy: [agent-id-on-start]
    domain: [cli]
    skill: [cli-command-implementation, neverthrow-error-handling]
    changeType: modify
    intent: >
      Prevent two agents from accidentally working the same task. If a task is
      already 'doing', tg start returns an error with the current claimant's
      agent_id. The --force flag allows the human to override.
    suggestedChanges: |
      In start.ts, after fetching current status, if status === 'doing':
        look up latest 'started' event, extract agent_id from body.
        Return err(TASK_ALREADY_CLAIMED, "Task is being worked by <agent>").
      Add --force option to bypass.
      Add TASK_ALREADY_CLAIMED to ErrorCode enum.

  - id: status-shows-doing
    content: "Enhance tg status to show all doing tasks with agent_id, plan title, and started_at"
    blockedBy: [agent-id-on-start]
    domain: [cli]
    skill: [cli-command-implementation]
    changeType: modify
    intent: >
      Make "who is working on what" visible at a glance. Every agent runs
      tg status at session start; now they see each other.
    suggestedChanges: |
      In status.ts, add a query:
        SELECT t.task_id, t.title, p.title as plan_title, e.body, e.created_at
        FROM task t
        JOIN plan p ON t.plan_id = p.plan_id
        JOIN event e ON e.task_id = t.task_id AND e.kind = 'started'
        WHERE t.status = 'doing'
        AND e.created_at = (SELECT MAX(e2.created_at) FROM event e2
            WHERE e2.task_id = t.task_id AND e2.kind = 'started')
      Display as "Active work:" section.

  - id: tg-note-command
    content: "Add tg note <taskId> --msg <text> command that appends a note event"
    blockedBy: [auto-migrate-on-command]
    domain: [cli]
    skill: [cli-command-implementation]
    changeType: create
    intent: >
      Give agents a lightweight way to leave breadcrumbs for each other and
      the human. "Schema is in flux, support both until migration lands" or
      "Changed parser signature, downstream tasks should re-check."
    suggestedChanges: |
      Create cli/note.ts. Accept taskId + --msg + optional --agent.
      Insert event with kind='note', body={ message, agent, timestamp }.
      Register in index.ts.

  - id: show-includes-notes
    content: "Update tg show to display recent note events (last 5) in task detail output"
    blockedBy: [tg-note-command]
    domain: [cli]
    skill: [cli-command-implementation]
    changeType: modify
    intent: >
      Notes are only useful if they're visible. tg show already displays
      recent events; ensure notes surface prominently.

  - id: session-start-rule-update
    content: "Update session-start.mdc to instruct agents to read the Active Work section of tg status and adapt"
    blockedBy: [status-shows-doing]
    domain: [cli]
    skill: [rule-authoring]
    changeType: modify
    intent: >
      Close the loop: agents already run tg status but currently ignore doing
      tasks from other agents. The rule should say: read active work, avoid
      picking tasks in the same area/files, and if overlap is detected, leave
      a note and pick a different task.

  - id: workflow-rule-agent-flag
    content: "Update taskgraph-workflow.mdc to document --agent flag on tg start and multi-agent orientation protocol"
    blockedBy: [agent-id-on-start, session-start-rule-update]
    domain: [cli]
    skill: [rule-authoring, documentation-sync]
    changeType: modify
    intent: >
      Ensure every agent session passes its identity. Add to the execution
      loop: tg start <taskId> --agent <name>. Document the orientation
      step: check active work, avoid overlap, leave notes.

  - id: agent-contract-update
    content: "Update AGENT.md and docs/agent-contract.md with multi-agent awareness section"
    blockedBy: [workflow-rule-agent-flag]
    domain: [cli]
    skill: [documentation-sync]
    changeType: modify
    intent: >
      The canonical agent contract should document: (1) always pass --agent,
      (2) read active work before picking tasks, (3) use tg note for
      cross-agent signals, (4) don't pick tasks in same area as another
      doing task without human approval.

  - id: multi-agent-rule
    content: "Create .cursor/rules/multi-agent.mdc with conflict-avoidance and coordination protocol"
    blockedBy: [agent-contract-update]
    domain: [cli]
    skill: [rule-authoring]
    changeType: create
    intent: >
      Dedicated rule file for multi-agent coordination. Includes: identity
      protocol, orientation checklist, overlap avoidance, note-leaving
      convention, and escalation to human when conflicts detected.
    suggestedChanges: |
      .cursor/rules/multi-agent.mdc — alwaysApply: false (manual activation).
      Content: When multiple agents are active, each MUST:
      1. Pass --agent <session-name> on tg start
      2. Read "Active work" from tg status before picking a task
      3. Avoid tasks touching same files/area as another doing task
      4. Leave tg note when changing shared interfaces (types, schema, parser)
      5. If overlap detected: pick a different task or ask human to arbitrate

  - id: docs-multi-agent
    content: "Create docs/multi-agent.md documenting the coordination model, conventions, and CLI additions"
    blockedBy: [multi-agent-rule]
    domain: [schema, cli]
    skill: [documentation-sync]
    changeType: create
    intent: >
      Single reference doc for the multi-agent centaur model: what it is,
      what it isn't (not Gastown-style orchestration), how agents coordinate,
      and the CLI commands that support it.

  - id: integration-tests
    content: "Add integration tests for claim guard, agent-id in events, status active-work display, and note command"
    blockedBy: [claim-guard-on-start, status-shows-doing, tg-note-command]
    domain: [cli]
    skill: [integration-testing]
    changeType: create
    intent: >
      Verify the core multi-agent primitives work end-to-end against a real
      Dolt instance.

  - id: schema-docs-update
    content: "Update docs/schema.md and docs/architecture.md to reflect auto-migrate, event body conventions, and new error codes"
    blockedBy: [auto-migrate-on-command, agent-id-on-start, claim-guard-on-start]
    domain: [schema]
    skill: [documentation-sync]
    changeType: modify

  - id: cli-reference-update
    content: "Update docs/cli-reference.md with tg note, tg start --agent, tg start --force, and enhanced tg status output"
    blockedBy: [tg-note-command, claim-guard-on-start, status-shows-doing]
    domain: [cli]
    skill: [documentation-sync]
    changeType: modify
isProject: false
---

## Analysis

### Problem Statement

When 2-3 agents work simultaneously on tasks from the same Task-Graph, they
currently have no way to:
1. See what other agents are actively working on
2. Know if the schema has been migrated (leading to "two worlds" bugs)
3. Claim a task exclusively (two agents can `tg start` the same task)
4. Leave breadcrumbs for each other ("I changed this interface, heads up")

### Design Principles

- **Centaur-first**: Human plans, audits, routes. Agents execute with visibility.
- **No orchestrator**: No "mayor" or coordinator agent. The human is the coordinator.
- **Publish + observe**: Agents broadcast intent (start, note) and observe state (status). They don't negotiate with each other.
- **Append-only coordination**: Notes and events are append-only (no conflicts). Claims are idempotent check-then-set.
- **Zero config for single agent**: All multi-agent features are additive. A single agent ignoring `--agent` still works fine.

### Approach: Borrow from Beads, Skip Gastown

From **Beads** we adopt:
- **Atomic claim** (`bd update --claim` → `tg start --agent`): one agent claims, others see it
- **Structured notes** (Beads messaging → `tg note`): durable, queryable breadcrumbs
- **Ready/status visibility** (`bd ready` → enhanced `tg status`): "who is doing what" at a glance

From **Gastown** we deliberately skip:
- Mayor/orchestrator (human fills this role)
- Convoys/swarms (overkill for 2-3 agents)
- Worktrees/hooks/polecats (we share one working copy)

### Dependency Graph

```mermaid
graph TD
    A[auto-migrate-on-command] --> B[agent-id-on-start]
    A --> E[tg-note-command]
    B --> C[claim-guard-on-start]
    B --> D[status-shows-doing]
    E --> F[show-includes-notes]
    D --> G[session-start-rule-update]
    B --> H[workflow-rule-agent-flag]
    G --> H
    H --> I[agent-contract-update]
    I --> J[multi-agent-rule]
    J --> K[docs-multi-agent]
    C --> L[integration-tests]
    D --> L
    E --> L
    A --> M[schema-docs-update]
    B --> M
    C --> M
    E --> N[cli-reference-update]
    C --> N
    D --> N
```

### Migration Safety (the root cause fix)

The single highest-leverage change is `auto-migrate-on-command`. Today, `tg init`
runs migrations, but if an agent is spawned in a repo where init ran months ago
(before junction tables existed), every query that touches `task_domain` fails.

The fix: add a `program.hook('preAction')` in `cli/index.ts` that chains all
idempotent migrations. Cost: one `information_schema` SELECT per migration per
command (~5ms each). Benefit: no agent ever encounters a stale schema.

<original_prompt>
What I want is to be operating in Centaur most of the time. But sometimes I
spin up to 3 agents to try and move faster. I think I don't mind pairing with
3 agents. What I don't want is to delegate to them as a team that doesn't
interact with me.

Can you make a plan for improvements to our system, graph, rules and agent
directives — supporting a few agents working with me on shipping a backlog of
tasks in the taskgraph. A classic example in the future will be working with
one or two agents in planning and another 2-3 in execution.
</original_prompt>
