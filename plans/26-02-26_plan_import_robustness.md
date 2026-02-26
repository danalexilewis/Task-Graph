---
name: Plan Import Robustness for Simple Models
overview: Surface YAML parse errors from js-yaml and document robust plan rules so agents can fix import failures.
todos:
  - id: test-parse-error-message
    content: Add test that bad YAML yields error message containing parse cause
    status: completed
    blockedBy:
      - surface-yaml-errors
  - id: surface-yaml-errors
    content: Surface underlying js-yaml error in parser when Cursor plan parse fails
    status: completed
  - id: doc-robust-rules
    content: Add docs for import-safe frontmatter and robust plan rules for simple models
    status: completed
    blockedBy:
      - surface-yaml-errors
  - id: update-plan-authoring-rule
    content: Update plan-authoring rule with minimal frontmatter checklist and validate step
    status: completed
    blockedBy:
      - doc-robust-rules
isProject: false
---

## Context (from user doc)

When agents create Cursor-format plans, the parser uses js-yaml on the frontmatter. Certain YAML constructs (em dashes, multiline with colons, nested objects in arrays) cause parse failures. The error is generic ("Failed to read or parse Cursor plan") — we now surface the underlying cause. Consequences: fallback to minimal plan loses blockedBy (wrong task order), and tg context lacks intent/fileTree.

## Completed work

- **surface-yaml-errors**: Parser catch block now includes cause message in error.
- **doc-robust-rules**: Added docs/plan-import-robustness.md with minimal frontmatter, body content, checklist, validate step.
- **test-parse-error-message**: Added test that invalid YAML yields error message containing parse cause.
- **update-plan-authoring-rule**: Plan-authoring.mdc now has Import robustness and validation section with validate step and link to docs/plan-import-robustness.md.

<original_prompt>
Plan Import Robustness: surface YAML parse errors, document robust plan rules for simple models, update plan-authoring rule, add test for parse error message.
</original_prompt>
