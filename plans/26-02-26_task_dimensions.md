---
name: 'Task Dimensions: domain, skill, change_type'
overview: |
  Add three queryable dimensions to tasks so agents can fetch contextual knowledge before starting work.

  1. **domain** (VARCHAR) — maps to `docs/<domain>.md`. Gives the agent domain knowledge context.
     e.g., domain="schema" → agent reads docs/schema.md before working.

  2. **skill** (VARCHAR) — the engineering technique required. Maps to `docs/skills/<skill>.md`.
     e.g., skill="sql-migration", "cli-design", "yaml-parsing", "testing", "refactoring".
     Agents query past tasks with the same skill to learn proven patterns.

  3. **change_type** (ENUM) — how to approach the work: create, modify, refactor, fix, investigate, test, document.
     This changes agent behavior: "refactor" means ensure tests pass before and after;
     "fix" means reproduce first; "create" means scaffold from scratch.

  Together these answer: what knowledge area (domain), what technique (skill), how to approach it (change_type).
  Queryable via tg next --domain X, tg next --skill Y, and a new tg context <taskId> that
  pre-loads the domain doc, skill guide, and related historical tasks.
todos:
  - id: workflow-rule-context
    content: 'Update taskgraph-workflow.mdc execution loop: after tg start, run tg context <taskId> and read the returned doc paths before doing work.'
    status: completed
    blockedBy:
      - tg-context-command
  - id: update-schema-docs
    content: Update docs/schema.md and docs/cli-reference.md to document the new columns, filters, and tg context command.
    status: completed
    blockedBy:
      - schema-migration
      - tg-context-command
      - cli-filters
  - id: seed-domain-docs
    content: Audit existing docs/ pages and ensure each has a clear domain slug. Create any missing domain pages for the key areas of this codebase (e.g., cli, plan-import, schema, error-handling, testing, architecture).
    status: completed
  - id: parser-support
    content: Extend CursorTodo interface and parseCursorPlan to extract domain, skill, changeType from plan YAML. Also update legacy parser if applicable.
    status: completed
    blockedBy:
      - update-types
  - id: importer-persist
    content: Update importer.ts ParsedTask interface and upsert logic to persist domain, skill, change_type on insert and update.
    status: completed
    blockedBy:
      - update-types
  - id: integration-tests
    content: 'Add integration tests: import a plan with domain/skill/changeType fields, verify they''re stored, verify tg next --domain filters correctly, verify tg context returns expected docs and related tasks.'
    status: completed
    blockedBy:
      - importer-persist
      - tg-context-command
      - cli-filters
  - id: schema-migration
    content: Add domain (VARCHAR 64), skill (VARCHAR 64), and change_type (ENUM create/modify/refactor/fix/investigate/test/document) columns to the task table. Write migration logic.
    status: completed
  - id: tg-context-command
    content: 'Add tg context <taskId>: output domain doc path, skill guide path, and related done tasks by domain/skill for agent pre-work.'
    status: completed
    blockedBy:
      - schema-migration
  - id: seed-skill-docs
    content: 'Create docs/skills/ directory with initial skill guides for the most common techniques: sql-migration.md, cli-command.md, yaml-parsing.md, rule-authoring.md. Each should have a consistent template: purpose, examples, gotchas.'
    status: completed
  - id: update-types
    content: Update TaskSchema in domain/types.ts and ParsedTask interface with the three new fields. Add ChangeType Zod enum.
    status: completed
    blockedBy:
      - schema-migration
  - id: cli-filters
    content: Add --domain, --skill, --change-type filter options to tg next and tg status. Allow combining filters.
    status: completed
    blockedBy:
      - schema-migration
  - id: plan-authoring-rule
    content: Update plan-authoring.mdc to document the three new todo fields (domain, skill, changeType) and add guidance on when to use each.
    status: completed
    blockedBy:
      - parser-support
isProject: false
---
