# Enhanced Plan Format (Rich Planning)

This document defines the **enhanced Cursor plan format**: analysis-rich plans with file trees, risks, tests, per-task intent and suggested code changes, and a structured markdown body. It is the reference for [Plan Authoring](.cursor/rules/plan-authoring.mdc).

All new fields are **optional**. Existing plans without these fields continue to import and behave as before.

---

## Principles

1. **Plans are research artifacts** — They should contain enough analysis that an agent (or human) can understand the full picture without re-reading the codebase.
2. **Structured data in YAML, narrative in markdown body** — Machine-parseable fields flow into Dolt; free-form analysis, diagrams, and the original prompt live in the body.
3. **Suggested changes are directional** — They give the agent a head start (file, function, approach), not a blueprint to copy.
4. **Risks and tests are identified during planning** — So execution doesn't discover "we should have tested that" too late.
5. **Original prompt is preserved** — In an `<original_prompt>` XML tag at the end of the body.

---

## YAML Frontmatter

### Required and Existing Fields

| Field      | Required | Description |
|-----------|----------|-------------|
| `name`    | yes      | Plan title. |
| `overview`| yes      | Brief description; can be multi-line. |
| `todos`   | yes      | Array of task objects (see below). |
| `isProject` | no    | Boolean; default false. |

### Plan-Level Optional Fields (Rich Planning)

| Field       | Type   | Stored in Dolt | Description |
|------------|--------|----------------|-------------|
| `fileTree` | string | `plan.file_tree` | Tree of files affected by the plan (e.g. paths with `(create)` / `(modify)`). |
| `risks`    | array  | `plan.risks`    | List of `{description, severity, mitigation}`. `severity`: `low`, `medium`, `high`. |
| `tests`    | array  | `plan.tests`    | List of strings describing tests that should be created. |

### Todo (Task) Fields

Base fields: `id`, `content`, `status`, `blockedBy`, `domain`, `skill`, `changeType`.

| Field             | Type   | Stored in Dolt        | Description |
|-------------------|--------|------------------------|-------------|
| `intent`          | string | `task.intent`         | Detailed description of what this task involves and why. Can reference files, functions, or constraints. |
| `suggestedChanges`| string | `task.suggested_changes` | Proposed code snippets or diffs as a starting point for the agent. Directional, not prescriptive. |

**Note:** `content` is used as the task title and must fit in the DB `title` column (VARCHAR(255)). Keep titles concise; put long descriptions in `intent`.

---

## Plan-Level Field Examples

### fileTree

Plain-text tree of files touched by the plan. Annotations like `(create)` or `(modify)` are optional but help readers.

```yaml
fileTree: |
  docs/
    plan-format.md           (create)
  src/
    db/migrate.ts            (modify)
```

### risks

```yaml
risks:
  - description: Migration could fail on existing data
    severity: high
    mitigation: Add pre-flight validation and dry-run mode
```

### tests

```yaml
tests:
  - "Import plan with fileTree, verify stored on plan row"
  - "tg context outputs suggested_changes when present"
```

---

## Per-Task intent and suggestedChanges

### intent

Maps to `task.intent`. Use for scope, rationale, and references to code.

```yaml
- id: add-migration
  content: Add plan table columns file_tree, risks, tests via idempotent migration.
  intent: |
    Add three nullable columns to the plan table in db/migrate.ts.
    Follow the applyTaskDimensionsMigration pattern: check column existence,
    then ALTER TABLE. Idempotent so re-run is safe.
  domain: schema
  skill: sql-migration
  changeType: modify
```

### suggestedChanges

Maps to `task.suggested_changes`. Shown by `tg context` so the agent has a concrete starting point.

```yaml
- id: update-types
  content: Update PlanSchema and TaskSchema in domain/types.ts with new columns.
  suggestedChanges: |
    PlanSchema: add file_tree (z.string().nullable()), risks (z.array(riskObj).nullable()).
  blockedBy: [other-id]
```

---

## Markdown Body (Below Frontmatter)

The content **after** the closing `---` of the frontmatter is the **narrative layer**. It is not parsed into individual DB columns but is part of the plan document for humans and agents.

### Recommended Sections

1. **Analysis** — Why this approach; what was explored or rejected.
2. **Proposed Changes** — Detailed code snippets, file paths, key logic (especially for complex changes).
3. **Mermaid Diagrams** — Data flows, state machines, dependency graphs.
4. **Risks** — Expanded discussion beyond the YAML `risks` list.
5. **Testing Strategy** — How tests will be structured and what they cover.
6. **Open Questions** — Unresolved items that may affect execution.

### Original Prompt

End the body with the user request that triggered the plan, inside an XML tag:

```xml
<original_prompt>
The user's original request that triggered this plan...
</original_prompt>
```

This preserves intent that may not be fully reflected in the structured fields.
