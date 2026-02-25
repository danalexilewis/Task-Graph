# Skill: Integration testing

## Purpose

Add or extend integration tests that run the real `tg` CLI against a temporary Dolt repo, so import/export/context/next behavior is validated end-to-end without touching the project's real `.taskgraph/`.

## Inputs

- Behavior to test (e.g. import with domain/skill, `tg context` output)
- `tools/taskgraph/__tests__/integration/test-utils.ts` (setup, teardown, runTgCli)
- Existing tests in `__tests__/integration/*.test.ts` as reference

## Steps

1. Use `setupIntegrationTest()` in `beforeAll`; use `teardownIntegrationTest(context.tempDir)` in `afterAll`.
2. Create any needed files under `context.tempDir` (e.g. `plans/foo.md`) with `fs.mkdirSync` and `fs.writeFileSync`.
3. Run the CLI via `runTgCli("import plans/foo.md --plan \"Bar\" --format cursor --no-commit", context.tempDir)`. Use `--no-commit` to keep tests fast and avoid commit noise.
4. Parse JSON output when needed (e.g. `plan list --json` to get `plan_id` for later commands).
5. Assert on `exitCode`, `stdout`, and (if needed) `stderr`. For expected failures use `runTgCli(..., context.tempDir, true)`.
6. If the test adds new DB columns or migrations, ensure `test-utils.ts` calls the migration (e.g. `applyTaskDimensionsMigration`) after `applyMigrations` so the temp schema matches production.

## Gotchas

- The CLI runs from `dist/`; run `pnpm run build` in `tools/taskgraph` before tests if you changed CLI code.
- Integration tests are excluded from default `vitest run`; use `pnpm run test:integration` (or `vitest run --dir __tests__/integration`).
- Temp dir is under `os.tmpdir()`; avoid relying on cwd. All paths in commands are relative to `context.tempDir`.
- DOLT_PATH is set in test-utils; CI and local should both have `dolt` available.

## Definition of done

- Test passes with `pnpm run test:integration`.
- Setup creates a fresh Dolt repo and applies all migrations used in production.
- Assertions cover the intended behavior (import result, CLI output, or DB state).
- No leftover temp dirs in normal runs (teardown runs in `afterAll`).
