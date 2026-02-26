# Skill: Refactoring safely

## Purpose

Change structure or implementation without changing behavior. Use when `changeType` is `refactor`: run tests before and after, take small steps, and avoid scope creep so the graph and product stay correct.

## Inputs

- Code or docs to refactor (same behavior, better structure)
- Test suite (unit and/or integration)
- Clear scope: what is in scope (e.g. extract function, rename) and out of scope (no new features, no behavior change)

## Steps

1. Run the relevant tests and note that they pass (or record current state if flaky).
2. Refactor in small steps: one rename, one extract, or one file move per step. Run tests after each step if practical.
3. Keep behavior identical: same inputs → same outputs; same CLI flags → same side effects.
4. If you touch taskgraph CLI or DB paths, run `pnpm run build` and `pnpm run test:integration` (or full test suite) before considering the refactor done.
5. Commit with a message that describes the refactor (e.g. “extract parseCursorPlan helper”) not the feature.

## Gotchas

- Resist adding a “quick fix” or feature while refactoring; that’s a separate task.
- If tests are missing for the area you refactor, add a minimal test first, then refactor so you have a safety net.
- Renaming across many files: use the IDE rename refactor to avoid missing references.
- For DB or schema refactors, follow the dolt-schema-migration skill; for CLI, follow cli-command-implementation.

## Definition of done

- Behavior is unchanged (same tests pass; same CLI behavior).
- Code is simpler or better structured.
- No new features or behavior changes mixed in.
- Test run (and optionally integration test) is green.
