# Skill: Rule authoring

## Purpose

Write or update Cursor rules (`.cursor/rules/*.mdc`) so agents consistently follow workflow and project conventions.

## Examples

- Use frontmatter: `description`, `globs` or `alwaysApply: true`.
- Keep rules short: bullet lists and one table; link to AGENT.md or docs for full detail.
- For workflow, state the exact commands and order (e.g. `tg start` then `tg context` then work then `tg done`).

## Gotchas

- Rules are additive; avoid contradicting AGENT.md. Prefer “do X” over “do not Y” where possible.
- If a rule is `alwaysApply: true`, keep it small so it stays in context every time.
