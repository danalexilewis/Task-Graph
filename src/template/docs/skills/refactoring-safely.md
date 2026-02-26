# refactoring-safely

Use this guide when the goal is **behavior-preserving change** (rename, reorganize, simplify, extract, delete dead code) while keeping externally-visible behavior stable.

## Principles

- Make the smallest change that moves you forward.
- Prefer mechanical edits (rename, move, extract) over semantic changes.
- Keep diffs reviewable: one intent per commit/PR section.

## Workflow

1. Identify the behavior you need to preserve.
2. Add/confirm tests (or a quick script) that will fail if behavior changes.
3. Refactor in small steps; run the tests after each meaningful step.
4. Only then do follow-up cleanup (formatting, dead code removal).

## When to stop and split

If the refactor reveals unrelated issues (bugs, missing coverage, design changes), split into new tasks so the original task stays predictable.

