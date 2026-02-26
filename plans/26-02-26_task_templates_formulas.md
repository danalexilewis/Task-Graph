---
name: Task Templates (Formulas)
overview: Add lightweight repeatable task templates that generate tasks without full plan files, inspired by Beads formulas.
fileTree: |
  src/cli/template.ts             (create)
  src/domain/template-schema.ts   (create)
  docs/templates/                 (create)
  docs/templates/README.md        (create)
  docs/cli-reference.md           (modify)
  __tests__/domain/template-schema.test.ts (create)
  __tests__/integration/template-apply.test.ts (create)
risks:
  - description: Overlap with plan import - users may be confused about when to use templates vs plans
    severity: medium
    mitigation: Clear docs distinguishing templates (repeatable patterns) from plans (one-off initiatives)
  - description: Template YAML parsing has the same pitfalls as plan import
    severity: low
    mitigation: Reuse the same robust YAML handling from plan-import/parser.ts
tests:
  - "tg template apply creates tasks with correct dependencies"
  - "Template variables are substituted in task titles and intent"
  - "Template without variables creates tasks as-is"
  - "Invalid template file returns clear error"
todos:
  - id: tpl-schema
    content: "Define template schema in src/domain/template-schema.ts"
    intent: |
      Zod schema for template files. A template is a YAML file with:
      - name: string (template name)
      - description: string
      - variables: array of { name, description, default? }
      - tasks: array of { id, title, intent?, blockedBy?, domain?, skill?, changeType? }
      Task titles and intents can contain {{variable}} placeholders.
    changeType: create
  - id: tpl-schema-tests
    content: "Unit tests for template schema validation"
    intent: |
      Test valid templates parse correctly. Test missing required fields error.
      Test variable substitution in titles and intents.
    changeType: test
  - id: tpl-cli
    content: "Add tg template apply command"
    intent: |
      New CLI command: tg template apply <file> --plan <planName> [--var key=value]...
      Reads the template YAML, substitutes variables, creates a plan and tasks in Dolt.
      Uses the same plan/task creation logic as import but from template format.
    suggestedChanges: |
      program.command('template').command('apply')
        .argument('<file>', 'Template YAML file')
        .option('--plan <name>', 'Plan name for created tasks')
        .option('--var <pairs...>', 'Variable substitutions as key=value')
    blockedBy: [tpl-schema]
    changeType: create
    domain: [cli]
    skill: [cli-command-implementation]
  - id: tpl-samples
    content: "Create sample templates in docs/templates/"
    intent: |
      Create 2-3 example templates:
      1. feature.yaml - standard feature template (schema, impl, tests, docs)
      2. bugfix.yaml - bug investigation and fix template
      3. refactor.yaml - safe refactoring template (tests first, then change, then verify)
      Include a README explaining the template format and usage.
    changeType: create
    skill: [documentation-sync]
  - id: tpl-integration-tests
    content: "Integration tests for template apply end-to-end"
    intent: |
      Apply a template with variables, verify plan and tasks are created in Dolt
      with correct titles, dependencies, and domains.
    blockedBy: [tpl-cli]
    changeType: test
    skill: [integration-testing]
  - id: tpl-update-docs
    content: "Document tg template command in cli-reference.md"
    intent: |
      Add template command docs. Explain template format, variables, and
      when to use templates vs full plans.
    blockedBy: [tpl-cli]
    changeType: document
    skill: [documentation-sync]
isProject: false
---

## Analysis

Plans are powerful but heavyweight — they're one-off documents with analysis, risks, and narrative.
For repeatable patterns ("every time we add a feature, we need schema + impl + tests + docs"),
Beads' formula system provides a lighter-weight alternative.

Templates are reusable YAML files that generate a plan with tasks when applied. Variables allow
customization (e.g. `{{feature_name}}`). Unlike plans, templates have no narrative body — they're
purely structural.

## Template format

```yaml
name: feature
description: Standard feature implementation pattern
variables:
  - name: feature_name
    description: Name of the feature
  - name: area
    description: Functional area (frontend, backend, etc.)
    default: backend
tasks:
  - id: schema
    title: "Add {{feature_name}} schema changes"
    intent: "Database schema for {{feature_name}} in {{area}}"
    domain: [schema]
    skill: [sql-migration]
  - id: implement
    title: "Implement {{feature_name}} logic"
    blockedBy: [schema]
    domain: [{ { area } }]
  - id: tests
    title: "Add tests for {{feature_name}}"
    blockedBy: [implement]
    skill: [integration-testing]
  - id: docs
    title: "Document {{feature_name}}"
    skill: [documentation-sync]
```

Usage: `tg template apply docs/templates/feature.yaml --plan "Auth Feature" --var feature_name=auth --var area=backend`

<original_prompt>
Add lightweight repeatable task templates (formulas) that generate tasks without
full plan files, inspired by Beads' formula system.
</original_prompt>
