---
name: External Gates
overview: Add gate primitives that block tasks on external events (human decisions, CI results, PR merges), inspired by Beads.
fileTree: |
  src/cli/gate.ts               (create)
  src/cli/index.ts              (modify)
  src/db/migrate.ts             (modify)
  src/domain/types.ts           (modify)
  docs/schema.md                (modify)
  docs/cli-reference.md         (modify)
  __tests__/integration/gates.test.ts (create)
risks:
  - description: Gate table adds schema complexity
    severity: medium
    mitigation: Simple table with minimal fields; gates are essentially named conditions
  - description: Polling external systems (CI, GitHub) adds reliability concerns
    severity: high
    mitigation: Start with manual gates only (human approval); automated polling is a future extension
  - description: Interaction with existing block command
    severity: low
    mitigation: Gates are a different mechanism - block is task-on-task; gates are task-on-condition
tests:
  - "tg gate create creates a gate with pending status"
  - "tg gate resolve marks gate as resolved"
  - "Task blocked on gate cannot start until gate is resolved"
  - "tg status shows gate-blocked tasks distinctly"
  - "tg gate list shows pending gates"
todos:
  - id: gate-schema
    content: "Add gate table to Dolt schema via migration"
    intent: |
      New table: gate (gate_id CHAR(36) PK, name VARCHAR(255), gate_type ENUM('human','ci','webhook'),
      status ENUM('pending','resolved','expired'), task_id CHAR(36) FK, resolved_at DATETIME NULL,
      created_at DATETIME). Idempotent migration in db/migrate.ts.
      Add GateSchema to domain/types.ts.
    changeType: create
    domain: [schema]
    skill: [sql-migration]
  - id: gate-types
    content: "Add gate types to domain/types.ts"
    intent: |
      Add GateTypeSchema (enum: human, ci, webhook), GateStatusSchema (enum: pending,
      resolved, expired), and GateSchema (full row type) to types.ts.
    changeType: modify
  - id: gate-cli
    content: "Add tg gate command with create, resolve, and list subcommands"
    intent: |
      tg gate create <name> --task <taskId> --type human: creates a gate, blocks the task.
      tg gate resolve <gateId>: marks gate as resolved, unblocks the task.
      tg gate list [--pending]: shows gates.
      When a gate is created for a task, the task status is set to 'blocked'.
      When the gate is resolved, if no other blockers exist, task returns to 'todo'.
    blockedBy: [gate-schema, gate-types]
    changeType: create
    domain: [cli]
    skill: [cli-command-implementation]
  - id: status-gates
    content: "Show gate-blocked tasks in tg status output"
    intent: |
      Update status.ts to distinguish gate-blocked tasks from dependency-blocked tasks.
      Show "blocked (gate: <name>)" in status output.
    blockedBy: [gate-cli]
    changeType: modify
    domain: [cli]
  - id: gate-integration-tests
    content: "Integration tests for gate lifecycle"
    intent: |
      Create a task, create a gate blocking it, verify task is blocked,
      resolve the gate, verify task is unblocked. Test multiple gates on one task.
    blockedBy: [gate-cli]
    changeType: test
    skill: [integration-testing]
  - id: gate-update-docs
    content: "Document gates in schema.md and cli-reference.md"
    intent: |
      Add gate table to schema.md. Document tg gate commands in cli-reference.md.
      Explain the difference between gates and task-on-task blocks.
    changeType: document
    skill: [documentation-sync]
isProject: false
---

## Analysis

Task-Graph's `tg block` command only supports task-on-task blocking. But real workflows often block
on external conditions: "wait for human approval", "wait for CI to pass", "wait for PR to merge".
Beads solves this with "gates" - async coordination primitives that represent external conditions.

Starting with human gates (manual resolve) keeps the implementation simple. Automated gates
(CI webhooks, GitHub events) can be added later as extensions.

## Gate lifecycle

```mermaid
stateDiagram-v2
  [*] --> pending: tg gate create
  pending --> resolved: tg gate resolve
  pending --> expired: tg gate expire (future)
  resolved --> [*]
  expired --> [*]
```

When a gate is created for a task:

1. Task status → blocked
2. Gate appears in `tg status` and `tg gate list`
3. Human (or future automation) runs `tg gate resolve <id>`
4. Task status → todo (if no other blockers)

<original_prompt>
Add gate primitives that block tasks on external events,
inspired by Beads' gate system (human, timer, GitHub gates).
</original_prompt>
