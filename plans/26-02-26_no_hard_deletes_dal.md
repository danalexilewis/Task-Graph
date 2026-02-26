---
name: No Hard Deletes & Data Access Layer
overview: |
  Guard against destructive operations on plans/tasks/edges/events. Convert all
  deletions to soft-deletes, harden the query layer, and add rules preventing
  agents from running raw destructive SQL. Presents three options with increasing
  scope: (A) hardened query layer + rules, (B) Dolt SQL triggers, (C) full CASL-based DAL.
fileTree: |
  src/db/query.ts                (modify — block DELETE/DROP/TRUNCATE in raw())
  src/db/connection.ts           (modify — query guard at doltSql level)
  src/plan-import/importer.ts    (modify — replace DELETE with soft-delete or upsert)
  src/domain/types.ts            (no change — canceled/abandoned already exist)
  src/domain/invariants.ts       (no change — transitions already block terminal→*)
  src/cli/cancel.ts              (create — tg cancel command for soft-delete)
  src/cli/index.ts               (modify — register cancel command)
  .cursor/rules/no-hard-deletes.mdc (create — agent rule)
  .cursor/agents/implementer.md  (modify — add constraint)
  AGENT.md                       (modify — add constraint)
  src/template/AGENT.md          (modify — add constraint)
  docs/cli-reference.md          (modify — document cancel)
  __tests__/integration/no-hard-deletes.test.ts (create)
risks:
  - description: Agents can bypass the CLI and run dolt sql directly in the terminal
    severity: high
    mitigation: Layered defense — query-level guard catches programmatic access; rule-level guard catches prompt-driven access; Dolt triggers (Option B) catch even direct dolt sql
  - description: Junction table cleanup (task_domain, task_skill) uses legitimate DELETE
    severity: medium
    mitigation: Whitelist junction tables explicitly; they are not core data — they are re-synced from plan files on import
  - description: Adding CASL (Option C) increases complexity and dependency surface
    severity: medium
    mitigation: Option C is optional and incremental — Options A+B provide strong protection without new deps
tests:
  - "q.raw() rejects DELETE/DROP/TRUNCATE on plan, task, edge, event tables"
  - "q.raw() allows DELETE on task_domain, task_skill (junction cleanup)"
  - "tg cancel <planId|taskId> sets status to cancelled/abandoned"
  - "No raw DELETE SQL exists in codebase outside whitelisted junction cleanup"
todos:
  - id: query-guard
    content: "Add destructive-SQL guard to doltSql() in connection.ts"
    status: pending
    intent: "Reject DELETE/DROP/TRUNCATE on plan, task, edge, event; whitelist task_domain, task_skill."
    changeType: modify
    domain: [schema]
  - id: cancel-command
    content: "Add tg cancel command for soft-deleting plans and tasks"
    status: pending
    blockedBy: [query-guard]
    intent: "tg cancel <id> sets plan→abandoned or task→canceled; create note event; refuse terminal states."
    changeType: create
    domain: [cli]
    skill: [cli-command-implementation]
  - id: importer-junction-cleanup
    content: "Document junction-table DELETE whitelist in importer"
    status: pending
    blockedBy: [query-guard]
    intent: "Add comments in importer.ts explaining why DELETE on task_domain/task_skill is whitelisted."
    changeType: modify
    domain: [plan-import]
  - id: agent-rules
    content: "Add no-hard-deletes rule and update agent templates"
    status: pending
    blockedBy: [cancel-command]
    intent: "Create no-hard-deletes.mdc; add Data safety to AGENT.md, template, implementer.md."
    changeType: create
    domain: [rules]
    skill: [rule-authoring]
  - id: status-filter-cancelled
    content: "Filter cancelled/abandoned from tg status and tg next by default"
    status: pending
    blockedBy: [cancel-command]
    intent: "Exclude canceled tasks and abandoned plans by default; add --all to include them."
    changeType: modify
    domain: [cli]
  - id: no-delete-integration-tests
    content: "Integration tests for destructive-SQL guard and cancel command"
    status: pending
    blockedBy: [agent-rules, status-filter-cancelled]
    intent: "Test guard rejects DELETE/DROP on core tables; allows junction DELETE; tg cancel; status --all."
    changeType: test
    skill: [integration-testing]
  - id: dolt-delete-triggers
    content: "Add BEFORE DELETE triggers on core tables via migration (Option B)"
    status: pending
    blockedBy: [no-delete-integration-tests]
    intent: "Migration: CREATE TRIGGER no_delete_<table> BEFORE DELETE; SIGNAL 45000. Idempotent. Verify Dolt support."
    changeType: create
    domain: [schema]
    skill: [sql-migration]
isProject: false
---

## Problem

A previous agent session ran raw SQL to delete all plans except one from the Dolt
database (commit message: "Keep only Meta-Planning Skills plan"). This destroyed
weeks of planning data. The codebase has no guard against this — `q.raw()` and
direct `dolt sql` can execute any destructive statement.

## Current state

| Area                                     | Status                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Query builder (`src/db/query.ts`)        | Exposes `insert`, `update`, `select`, `count`, `raw`. No `delete` method. But `raw()` is unrestricted. |
| `doltSql` (`src/db/connection.ts`)       | Executes any SQL via `dolt sql -q`. No filtering.                                                      |
| Task status                              | `canceled` exists as terminal state. Transitions: `todo/doing/blocked → canceled`.                     |
| Plan status                              | `abandoned` exists. No transition rules enforced in code (only task transitions are checked).          |
| Importer (`src/plan-import/importer.ts`) | Uses `DELETE FROM task_domain/task_skill` for junction sync. Legitimate but uses raw().                |
| Agent rules                              | No rule says "never delete". Agents can run any shell command including `dolt sql`.                    |
| Dolt-level guards                        | None. No triggers, no read-only branches, no permission model.                                         |

## Three Options

### Option A: Hardened Query Layer + Rules (recommended first)

**What**: Add a destructive-SQL guard at the `doltSql` level, replace importer DELETEs
with a whitelisted path, add a `tg cancel` command, and add agent rules forbidding
destructive operations.

**Scope**: 6 tasks, ~2 days, zero new dependencies.

**Defense layers**:

1. **Code guard** — `doltSql()` rejects any query matching `DELETE FROM`, `DROP TABLE`,
   `TRUNCATE` on core tables (`plan`, `task`, `edge`, `event`). Junction tables
   (`task_domain`, `task_skill`) are whitelisted. This catches both `q.raw()` and any
   code calling `doltSql()` directly.
2. **No delete method** — Query builder already has no `delete()`. Keep it that way.
3. **Soft-delete commands** — `tg cancel <id>` sets plan to `abandoned` or task to
   `canceled`. `tg status` filters these out by default; `--all` shows them.
4. **Agent rules** — New `.cursor/rules/no-hard-deletes.mdc` (alwaysApply) +
   additions to AGENT.md and implementer template: "NEVER run DELETE, DROP, or
   TRUNCATE on the task graph. Use `tg cancel` for soft-delete."
5. **Audit** — All status changes already go through `event` table. Cancellation
   events provide full audit trail.

**Weakness**: Agents can still open a terminal and run `dolt sql -q "DELETE..."` directly,
bypassing the Node process entirely. Rules are the only defense there.

### Option B: Dolt SQL Triggers (defense in depth)

**What**: Add BEFORE DELETE triggers on `plan`, `task`, `edge`, `event` tables that
`SIGNAL SQLSTATE '45000'` (raise error), making DELETE physically impossible even
via direct `dolt sql`.

**Scope**: 1 additional task on top of Option A, ~0.5 days.

**Defense layers** (adds to Option A): 6. **Database-level guard** — Even if an agent runs `dolt sql -q "DELETE FROM plan..."`,
the trigger fires and the DELETE fails with an error. This is the strongest possible
guard — it operates at the storage layer.

**How**:

```sql
CREATE TRIGGER no_delete_plan BEFORE DELETE ON `plan`
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard deletes are forbidden. Use status = abandoned.';
```

Same for `task`, `edge`, `event`. Applied via a new migration.

**Weakness**: Triggers can be dropped by `DROP TRIGGER`. But dropping a trigger is itself
a destructive action that the query guard (Option A) would catch. An agent would have to
intentionally circumvent both layers.

**Note**: Need to verify Dolt supports BEFORE DELETE triggers (Dolt supports MySQL triggers
as of v1.x — need to confirm exact support level).

### Option C: CASL-Based DAL with Role Permissions (future)

**What**: Wrap all data access in a DAL that uses CASL to define per-role permissions.
Each agent type (implementer, reviewer, analyst, orchestrator) gets a role with specific
allowed actions.

**Scope**: 4–6 additional tasks on top of Option A, ~3–5 days, adds `@casl/ability` dep.

**Roles and permissions**:

| Role         | plan                         | task                         | edge                 | event        |
| ------------ | ---------------------------- | ---------------------------- | -------------------- | ------------ |
| orchestrator | read, create, update         | read, create, update         | read, create         | read, create |
| implementer  | read                         | read, update (status only)   | read                 | read, create |
| reviewer     | read                         | read                         | read                 | read, create |
| analyst      | read                         | read                         | read                 | read         |
| human        | read, create, update, cancel | read, create, update, cancel | read, create, delete | read, create |

**How it works**:

1. Each CLI command or sub-agent call passes a `role` context (e.g. from `--agent` name
   or a new `--role` flag).
2. The DAL wraps `query()` and checks CASL abilities before executing.
3. Unauthorized actions return an `UNAUTHORIZED` error.

**Weakness**:

- Adds a dependency and complexity layer.
- Does NOT prevent direct `dolt sql` — CASL operates in the Node process only.
- Agent names are self-reported; a malicious prompt could claim to be an orchestrator.
- Overkill until we have real multi-tenant or untrusted-agent scenarios.

**When it makes sense**: When you have agents running in separate processes with different
trust levels (e.g. cloud-hosted agents, third-party plugins).

## Recommendation

**Do Option A now. Add Option B if Dolt triggers work. Defer Option C.**

Option A covers the actual attack vector (agent running raw SQL via code or prompt) with
zero new dependencies. Option B makes it physically impossible even via direct terminal
access. Option C is architecturally clean but solves a problem that doesn't exist yet
(untrusted agents with separate identity).

## Tasks (execution order: A first, then B)

All tasks are ordered by dependency. Execute Option A (tasks 1–6) before Option B (task 7).

| #   | Task ID                     | Phase | Blocked by                           |
| --- | --------------------------- | ----- | ------------------------------------ |
| 1   | query-guard                 | A     | —                                    |
| 2   | cancel-command              | A     | query-guard                          |
| 3   | importer-junction-cleanup   | A     | query-guard                          |
| 4   | agent-rules                 | A     | cancel-command                       |
| 5   | status-filter-cancelled     | A     | cancel-command                       |
| 6   | no-delete-integration-tests | A     | agent-rules, status-filter-cancelled |
| 7   | dolt-delete-triggers        | B     | no-delete-integration-tests          |

```yaml
todos:
  - id: query-guard
    content: "Add destructive-SQL guard to doltSql() in connection.ts"
    status: pending
    intent: |
      Before executing any SQL in doltSql(), check if the query matches
      DELETE FROM|DROP TABLE|TRUNCATE TABLE on core tables (plan, task, edge, event).
      If matched, return err(buildError(ErrorCode.VALIDATION_FAILED, "Hard deletes
      forbidden on <table>. Use tg cancel for soft-delete.")).
      Allow DELETE on junction tables (task_domain, task_skill) — these are sync
      operations, not data destruction.
      Use a regex or simple string match (case-insensitive).
    suggestedChanges: |
      In doltSql(), before the execa call:
      const PROTECTED_TABLES = ['plan', 'task', 'edge', 'event'];
      const destructivePattern = /\b(DELETE\s+FROM|DROP\s+TABLE|TRUNCATE\s+TABLE?)\s+[`]?(\w+)[`]?/i;
      const match = query.match(destructivePattern);
      if (match && PROTECTED_TABLES.includes(match[2])) {
        return errAsync(buildError(ErrorCode.VALIDATION_FAILED,
          `Hard deletes are forbidden on table '${match[2]}'. Use tg cancel for soft-delete.`));
      }
    changeType: modify
    domain: [schema]

  - id: cancel-command
    content: "Add tg cancel command for soft-deleting plans and tasks"
    status: pending
    blockedBy: [query-guard]
    intent: |
      New CLI command: tg cancel <id> [--type plan|task]
      - Auto-detect whether id is a plan or task (try plan first, then task).
      - For plans: set status = 'abandoned', updated_at = now().
      - For tasks: check valid transition (todo/doing/blocked → canceled), set status.
      - Create an event: kind='note', body={type:'cancel', reason: options.reason}.
      - Support --reason "..." for documenting why.
      - Refuse to cancel done tasks/plans (terminal states).
    changeType: create
    domain: [cli]
    skill: [cli-command-implementation]

  - id: importer-junction-cleanup
    content: "Document junction-table DELETE whitelist in importer"
    status: pending
    blockedBy: [query-guard]
    intent: |
      In src/plan-import/importer.ts, the DELETE FROM task_domain / task_skill
      statements use q.raw(). These are legitimate (junction table sync) and are
      whitelisted in the query guard. Add a comment above each explaining why
      DELETE is acceptable here (junction sync, not data destruction).
    changeType: modify
    domain: [plan-import]

  - id: agent-rules
    content: "Add no-hard-deletes rule and update agent templates"
    status: pending
    blockedBy: [cancel-command]
    intent: |
      Create .cursor/rules/no-hard-deletes.mdc (alwaysApply: true):
      - NEVER execute DELETE, DROP TABLE, or TRUNCATE on the task graph database.
      - NEVER run raw dolt sql commands that modify or delete data.
      - To remove a plan: tg cancel <planId> --reason "..."
      - To remove a task: tg cancel <taskId> --reason "..."
      - These are soft-deletes (plan→abandoned, task→canceled). Data is preserved.
      - If a user asks to "delete", "remove", or "clean up" plans or tasks,
        use tg cancel instead. Explain what you're doing.

      Update AGENT.md, src/template/AGENT.md, .cursor/agents/implementer.md:
      add a "Data safety" section referencing the rule.
    changeType: create
    domain: [rules]
    skill: [rule-authoring]

  - id: status-filter-cancelled
    content: "Filter cancelled/abandoned from tg status and tg next by default"
    status: pending
    blockedBy: [cancel-command]
    intent: |
      Update status.ts and next.ts to exclude canceled tasks and abandoned plans
      from default output. Add --all flag that includes them.
      This ensures soft-deleted items don't clutter normal workflow but remain
      queryable when needed.
    changeType: modify
    domain: [cli]

  - id: no-delete-integration-tests
    content: "Integration tests for destructive-SQL guard and cancel command"
    status: pending
    blockedBy: [agent-rules, status-filter-cancelled]
    intent: |
      Test 1: q.raw("DELETE FROM plan WHERE ...") returns VALIDATION_FAILED error.
      Test 2: q.raw("DROP TABLE task") returns VALIDATION_FAILED error.
      Test 3: q.raw("DELETE FROM task_domain WHERE ...") succeeds (whitelisted).
      Test 4: tg cancel <planId> sets plan status to abandoned.
      Test 5: tg cancel <taskId> sets task status to canceled.
      Test 6: tg cancel on a done task fails (terminal state).
      Test 7: tg status excludes canceled/abandoned by default.
      Test 8: tg status --all includes them.
    changeType: test
    skill: [integration-testing]

  - id: dolt-delete-triggers
    content: "Add BEFORE DELETE triggers on core tables via migration (Option B)"
    status: pending
    blockedBy: [no-delete-integration-tests]
    intent: |
      New migration in db/migrate.ts: for each of plan, task, edge, event,
      CREATE TRIGGER no_delete_<table> BEFORE DELETE ON <table>
      FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '...'.
      Idempotent: check if trigger exists before creating.
      Test: verify dolt sql -q "DELETE FROM plan WHERE 1=0" returns error.
      First verify Dolt supports BEFORE DELETE triggers (if not, skip or document limitation).
    changeType: create
    domain: [schema]
    skill: [sql-migration]
```

## Option C tasks (deferred — for reference only)

Not broken into tasks yet. Would involve:

1. Add `@casl/ability` dependency
2. Define role abilities (orchestrator, implementer, reviewer, analyst)
3. Create DAL wrapper around `query()` that checks abilities
4. Pass role context through CLI commands
5. Integration tests for permission enforcement

<original_prompt>
Guard against destructive database operations. Never hard-delete plans or tasks.
Convert destructive actions to soft-deletes. Consider a DAL with CASL permissions
for role-based access control. Present multiple options.
</original_prompt>
