---
name: Plan-to-project Dolt rename
overview: Rename every schema object, migration, and code reference in tg Dolt from "plan" to "project" — table columns (plan_id→project_id), plan_worktree→project_worktree, event body (plan_branch→project_branch), API/types, and docs. Requires Dolt repair first if journal is corrupted.
fileTree: |
  src/db/migrate.ts
  src/db/recurrence.ts
  src/cli/status.ts
  src/cli/start.ts
  src/cli/done.ts
  src/cli/agents.ts
  src/cli/import.ts
  src/cli/plan.ts
  src/plan-import/importer.ts
  src/domain/types.ts
  src/api/types.ts
  docs/schema.md
  docs/glossary.md
risks:
  - description: Migration order wrong; FK drop/rename order breaks Dolt
    severity: high
    mitigation: Single migration adds project_id, backfills, drops FKs, renames columns, re-adds FKs; test on copy of real DB
  - description: Existing event.body rows have plan_branch / plan_worktree_path
    severity: medium
    mitigation: Read path accepts both plan_* and project_* during transition; no backfill of history
  - description: Bootstrap must not run when project table already exists
    severity: medium
    mitigation: applyMigrations uses tableExists("project"); bootstrap SCHEMA creates project with project_id for new installs only
tests:
  - "Integration tests (plan-worktree, agents, dolt-sync, import, status, start/done) updated and passing"
  - "Migration idempotency: run twice on same DB, no errors"
todos:
  - id: dolt-fsck-note
    content: "Doc: note Dolt corruption repair (dolt fsck) before migrations"
    agent: documenter
    intent: |
      User hit "corrupted journal" when tg ran; migration failed on table probe. Add a short note (e.g. in docs/infra.md or schema.md "Recovery") that if Dolt fails with "corrupted journal" or "possible data loss detected", run `dolt fsck` in the data-dir (e.g. .taskgraph/dolt) to assess and attempt repairs before re-running tg.
    changeType: create
  - id: migration-project-id
    content: "Migration: add applyProjectIdRenameMigration (plan_id→project_id, drop plan view)"
    agent: implementer
    intent: |
      In src/db/migrate.ts add a new migration that runs after applyPlanToProjectRenameMigration. Steps: (1) If project.project_id already exists, skip. (2) Add project_id to project; backfill project_id = plan_id. (3) Add project_id to task, decision; backfill from plan_id. (4) Drop FKs task_plan_id_fk, decision_plan_id_fk. (5) Drop column plan_id from project and make project_id the PK (or rename plan_id→project_id); drop plan_id from task and decision, rename/add so they use project_id. (6) Re-add FKs to project(project_id). (7) Drop view plan if exists. (8) Update idx_task_plan_id to idx_task_project_id (drop old, create on project_id). Idempotent at each step. Append to MIGRATION_CHAIN and call from ensureMigrations. See docs/skills/dolt-schema-migration.md.
    changeType: modify
  - id: migration-project-worktree
    content: "Migration: plan_worktree → project_worktree table and project_id column"
    agent: implementer
    blockedBy: [migration-project-id]
    intent: |
      In src/db/migrate.ts: (1) New migration applyPlanWorktreeToProjectWorktreeMigration. If project_worktree exists, skip. (2) If plan_worktree exists: CREATE project_worktree (project_id PK, worktree_path, worktree_branch, created_at); INSERT INTO project_worktree SELECT plan_id AS project_id, worktree_path, worktree_branch, created_at FROM plan_worktree; DROP plan_worktree. (3) Update applyPlanWorktreeMigration so new installs create project_worktree with project_id (not plan_worktree with plan_id). Add to MIGRATION_CHAIN after project_id migration.
    changeType: modify
  - id: migration-evolve-learning
    content: "Migration: evolve_run_quality and learning plan_id → project_id"
    agent: implementer
    blockedBy: [migration-project-id]
    intent: |
      In applyEvolveRunQualityMigration and applyLearningRecurrenceMigration: create tables with project_id (not plan_id). For existing DBs that already have these tables with plan_id: add migration that adds project_id, backfills from plan_id, drops plan_id (or ALTER rename). Idempotent.
    changeType: modify
  - id: bootstrap-project-id
    content: "Bootstrap: create project with project_id; applyMigrations check project"
    agent: implementer
    blockedBy: [migration-project-id]
    intent: |
      In src/db/migrate.ts: (1) Change SCHEMA array so the first statement creates table project (project_id CHAR(36) PRIMARY KEY, ...) and task/decision reference project(project_id). (2) In applyMigrations use tableExists(repoPath, "project") instead of "plan" so existing DBs skip bootstrap. New installs get project + project_id from first run.
    changeType: modify
  - id: code-db-layer
    content: "Code: db layer plan_id→project_id (migrate.ts helpers, recurrence.ts)"
    agent: implementer
    blockedBy: [migration-project-id]
    intent: |
      migrate.ts: planColumnExists → projectColumnExists (check table project, column project_id or plan_id for idempotency). applyPlanHashIdMigration use project and project_id in UPDATE. applyIndexMigration use idx_task_project_id and project_id. recurrence.ts: plan_id → project_id in types and insert. No raw SQL in recurrence that still says plan_id.
    changeType: modify
  - id: code-cli-status-next-start-done
    content: "Code: CLI status, next, agents, start, done — project_id, project_title, project_worktree"
    agent: implementer
    blockedBy: [migration-project-worktree, code-db-layer]
    intent: |
      status.ts, next.ts, agents.ts, start.ts, done.ts: Replace plan_id with project_id, plan_title with project_title in types and SQL. start.ts/done.ts: plan_worktree table → project_worktree, plan_id → project_id; event body plan_branch → project_branch, plan_worktree_path → project_worktree_path (write path). Read path in done/status: accept both plan_branch and project_branch (and plan_worktree_path / project_worktree_path) for existing events. All bt("project"), SELECT p.project_id, JOIN project p ON t.project_id = p.project_id.
    changeType: modify
  - id: code-cli-import-plan-cancel-etc
    content: "Code: CLI import, plan, cancel, plan-summary, initiative, template, stats, crossplan, evolve-health"
    agent: implementer
    blockedBy: [code-db-layer]
    intent: |
      import.ts, plan.ts (cli), cancel.ts, plan-summary.ts, initiative.ts, template.ts, stats.ts, crossplan.ts, evolve-health.ts: All references to plan_id, plan_title, and plan_worktree table/column → project_id, project_title, project_worktree. SQL and TypeScript types/row shapes. Use bt("project"), project_id, project_worktree where applicable.
    changeType: modify
  - id: code-plan-import-export
    content: "Code: plan-import/importer, export (graph-data, markdown)"
    agent: implementer
    blockedBy: [code-db-layer]
    intent: |
      plan-import/importer.ts: where/insert use project_id. export/graph-data.ts, export/markdown.ts: plan_id → project_id in whereClause and types. Domain types in importer already use plan_id in schema; switch to project_id and align with domain/types.ts.
    changeType: modify
  - id: code-api-types-client
    content: "Code: API types and client — project_id, project_title, project_name, project_overview"
    agent: implementer
    blockedBy: [code-db-layer]
    intent: |
      src/api/types.ts: plan_id→project_id, plan_title→project_title, plan_name→project_name, plan_overview→project_overview in NextTaskRow, ContextResult, StatusActivePlan, StatusPlanRow, StatusActiveWork, StatusTaskRow. src/api/client.ts: SQL and response mapping use project_id, project_title, etc.
    changeType: modify
  - id: code-domain-mcp
    content: "Code: domain types, plan-completion, token-estimate, hive; MCP tools"
    agent: implementer
    blockedBy: [code-db-layer]
    intent: |
      domain/types.ts: Zod and types plan_id→project_id. plan-completion.ts, token-estimate.ts, hive.ts: plan_id→project_id, plan_name→project_name, plan_overview→project_overview. mcp/tools.ts: raw SQL and select columns plan_id→project_id, plan_title→project_title.
    changeType: modify
  - id: code-worktree-branch-name
    content: "Code: worktree branch naming — PROJECT_BRANCH_PREFIX, project_branch in event body"
    agent: implementer
    blockedBy: [code-cli-status-next-start-done]
    intent: |
      cli/worktree.ts: PLAN_BRANCH_PREFIX → PROJECT_BRANCH_PREFIX ("project-"); createPlanBranchAndWorktree (or rename to createProjectBranchAndWorktree) uses project-<hash_id>. start.ts writes project_branch (and project_worktree_path) to event body. Read path continues to accept plan_branch for existing events.
    changeType: modify
  - id: tests-update-all
    content: "Tests: update all __tests__ for project_id, project_title, project_worktree, project_branch"
    agent: implementer
    blockedBy: [code-cli-status-next-start-done, code-cli-import-plan-cancel-etc, code-plan-import-export, code-api-types-client, code-domain-mcp, code-worktree-branch-name]
    intent: |
      Every __tests__ file that uses plan_id, plan_title, plan_branch, plan_worktree, or SQL with plan_id/plan_worktree: update to project_id, project_title, project_branch, project_worktree and new column/table names. Includes integration (plan-worktree, agents, dolt-sync, import, status, start/done, initiative, footprint, plan-summary, etc.), e2e, mcp/tools, db/recurrence, domain/types, skills/health-check. Run pnpm build && pnpm test:integration after changes.
    changeType: modify
  - id: docs-schema-glossary-cli
    content: "Docs: schema, glossary, cli-reference — project_id, project_worktree, project_branch"
    agent: documenter
    blockedBy: [tests-update-all]
    intent: |
      docs/schema.md: Table names and columns use project, project_id, project_worktree; remove or update "view plan" backward compat; event body project_branch, project_worktree_path. docs/glossary.md: remove "plan view" compat note; Plan (file) vs Project (entity) already correct. docs/cli-reference.md: --plan flag document as "project ID or title" where relevant. docs/skills/dolt-schema-migration.md: mention project_id naming if needed.
    changeType: modify
isProject: false
---

# Plan-to-project Dolt rename

## Analysis

The task graph already has table `project` (renamed from `plan` by applyPlanToProjectRenameMigration), but the **column** name is still `plan_id` everywhere (project PK, task, decision, plan_worktree, evolve_run_quality, learning). The view `plan` exists for backward compatibility. The user wants **everything** that referred to "plan" (the entity) to become "project": column names, table name `plan_worktree` → `project_worktree`, event body fields (`plan_branch` → `project_branch`), API and domain types, and docs.

**Dolt corruption:** The migration failure the user saw ("corrupted journal", "possible data loss detected") is a Dolt storage issue. Before running any migrations, they should run `dolt fsck` in the data-dir (e.g. `.taskgraph/dolt`) to assess and attempt repairs. The first task documents this.

**Approach:** (1) One new migration adds `project_id`, backfills from `plan_id`, drops FKs, renames columns, re-adds FKs, drops view `plan`. (2) Second migration renames `plan_worktree` → `project_worktree` and column to `project_id`. (3) Evolve/learning tables get `project_id`. (4) Bootstrap SCHEMA creates `project` with `project_id` for new installs; applyMigrations checks `project` table. (5) All code and tests updated to `project_id`, `project_title`, `project_worktree`, `project_branch`. (6) Read path for event body accepts both `plan_branch` and `project_branch` so existing events keep working.

## Dependency graph

```
Parallel start:
  ├── dolt-fsck-note
  └── migration-project-id

After migration-project-id:
  ├── migration-project-worktree
  ├── migration-evolve-learning
  ├── bootstrap-project-id
  └── code-db-layer

After code-db-layer + migration-project-worktree:
  ├── code-cli-status-next-start-done
  ├── code-cli-import-plan-cancel-etc
  ├── code-plan-import-export
  ├── code-api-types-client
  └── code-domain-mcp

After code-cli-status-next-start-done:
  └── code-worktree-branch-name

After all code tasks:
  └── tests-update-all

After tests-update-all:
  └── docs-schema-glossary-cli
```

## Proposed changes

- **Migration order:** Add `project_id` to `project`, backfill; add to `task`/`decision`, backfill; drop FKs; rename columns (or drop `plan_id` and use `project_id` as PK/FK); re-add FKs; drop view `plan`; update index name. Then `plan_worktree` → `project_worktree` with `project_id`.
- **Event body:** Write `project_branch` and `project_worktree_path`; read path accepts `plan_branch`/`project_branch` and `plan_worktree_path`/`project_worktree_path`.
- **Branch name:** Use `project-<hash_id>` for new branches; keep accepting existing `plan-<hash_id>` in read path.
- **Bootstrap:** New installs get `CREATE TABLE project (project_id ...)` and task/decision with `project_id` FK; applyMigrations skips bootstrap when `project` exists.

## Original prompt

<original_prompt>
Migration failed: Dolt SQL query failed... possible data loss detected in journal file... corrupted journal... please run 'dolt fsck'...

/plan to go through every single table and migration and update everything in tg dolt that used to be plan to being project. This needs to happen now.
</original_prompt>
