---
name: run_dolt_backed_tests
overview: Provide a reliable runbook for executing taskgraph e2e and integration tests with Dolt by ensuring Dolt binary availability, running from the package root, and avoiding pnpm workspace resolution from temp test directories.
todos:
  - id: env-precheck
    content: Verify Dolt binary and export DOLT_PATH before tests
    status: pending
  - id: run-tests
    content: Build taskgraph and run integration/e2e from tools/taskgraph
    status: pending
  - id: harden-e2e-runner
    content: Switch e2e CLI invocation to direct node dist path and pass DOLT_PATH env
    status: pending
isProject: false
---

# Run e2e/integration tests with Dolt

## Preconditions (from Dolt docs + repo behavior)

- Dolt must be installed and callable (`dolt init`, `dolt sql -q ...` are required by test setup and migrations).
- In this machine, Dolt is at `/usr/local/bin/dolt`.
- Run test commands from `[/Users/dan/repos/Task-Graph/tools/taskgraph](/Users/dan/repos/Task-Graph/tools/taskgraph)`, where `[package.json](/Users/dan/repos/Task-Graph/tools/taskgraph/package.json)` defines `test:e2e` and `test:integration`.

## Recommended command flow

1. From `[/Users/dan/repos/Task-Graph/tools/taskgraph](/Users/dan/repos/Task-Graph/tools/taskgraph)`, export Dolt path explicitly:
  - `export DOLT_PATH=/usr/local/bin/dolt`
2. Build first:
  - `pnpm run build`
3. Run integration tests:
  - `pnpm run test:integration`
4. Run e2e tests:
  - `pnpm run test:e2e`

## Why this is needed in this repo

- `[src/cli/init.ts](/Users/dan/repos/Task-Graph/tools/taskgraph/src/cli/init.ts)` and `[src/db/connection.ts](/Users/dan/repos/Task-Graph/tools/taskgraph/src/db/connection.ts)` now use `process.env.DOLT_PATH || "dolt"`; setting `DOLT_PATH` avoids PATH drift.
- Integration helper `[__tests__/integration/test-utils.ts](/Users/dan/repos/Task-Graph/tools/taskgraph/__tests__/integration/test-utils.ts)` still shells `dolt init` and runs CLI commands that assume a valid package context.
- `ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND` happens when `pnpm run start ...` is executed from temp directories with no local `package.json`.

## Stabilization fix plan for flaky e2e command resolution

1. In `[__tests__/e2e/core-flow.test.ts](/Users/dan/repos/Task-Graph/tools/taskgraph/__tests__/e2e/core-flow.test.ts)`, invoke CLI directly via Node absolute path (`node dist/cli/index.js`) instead of `pnpm run start --filter ...` from temp `cwd`.
2. Keep temp directory as `cwd` for CLI behavior, but ensure build step runs from package root only.
3. Pass `env: { ...process.env, DOLT_PATH }` in test `execa` wrappers so both `dolt init` and `dolt sql` resolve consistently.

## Quick verification commands

- Dolt health check:
  - `dolt version`
  - `dolt sql -q "show tables"` (inside an initialized temp repo)
- Repo test check:
  - `pnpm run test:integration`
  - `pnpm run test:e2e`

