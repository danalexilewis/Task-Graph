---
name: resolve_type_errors_taskgraph
overview: Tighten neverthrow async typing and query generic usage, then verify with targeted TypeScript and test runs. Focus on fixing element-vs-array generic misuse and Result vs ResultAsync mismatches causing overload/type errors.
todos:
  - id: fix-invariants-resultasync
    content: Convert sync ok/err returns to okAsync/errAsync in checkRunnable and fix raw generic element type
    status: completed
  - id: fix-query-callsites-generics
    content: Change select/raw callsites from T[] generics to element generics in graph-data and importer
    status: completed
  - id: fix-integration-exitcode-typing
    content: Normalize execa exitCode to strict number and tighten catch typing in integration test utils
    status: in_progress
  - id: run-validation
    content: Run taskgraph type/build checks, then full build + e2e + integration suite
    status: pending
isProject: false
---

# Resolve Taskgraph Type Errors

Your proposed direction is mostly right, with one key correction: the main issue in `query.ts` is not the cast location, but **consumer generic misuse** (`T[]` passed where `T` is expected).

## What’s Actually Failing

- In `[tools/taskgraph/src/domain/invariants.ts](tools/taskgraph/src/domain/invariants.ts)`, `checkRunnable()` chains on `ResultAsync` but returns sync `err(...)` / `ok(...)` in `.andThen(...)` callbacks, causing overload/type mismatch (`ResultAsync<unknown, unknown>` style errors).
- In `[tools/taskgraph/src/domain/invariants.ts](tools/taskgraph/src/domain/invariants.ts)`, `q.raw<{ "COUNT(*)": number }[]>(...)` passes `T[]` instead of `T`, which becomes nested array typing.
- In `[tools/taskgraph/src/export/graph-data.ts](tools/taskgraph/src/export/graph-data.ts)` and `[tools/taskgraph/src/plan-import/importer.ts](tools/taskgraph/src/plan-import/importer.ts)`, `select<Task[]>()` and `raw<Edge[]>()` similarly misuse generics; APIs already return `ResultAsync<T[], AppError>`.
- In `[tools/taskgraph/__tests__/integration/test-utils.ts](tools/taskgraph/__tests__/integration/test-utils.ts)`, `exitCode` can be typed as possibly undefined in some execa paths/catches; returned type requires strict `number`.

## Implementation Plan

1. **Fix async neverthrow consistency in `checkRunnable`**
  - Update `[tools/taskgraph/src/domain/invariants.ts](tools/taskgraph/src/domain/invariants.ts)` to use `errAsync(...)` / `okAsync(undefined)` inside `.andThen(...)` callbacks.
  - Ensure callback return types remain `ResultAsync<..., AppError>` on all branches.
2. **Fix query generic usage at callsites (element type only)**
  - Replace `select<Task[]>()` with `select<Task>()` in:
    - `[tools/taskgraph/src/export/graph-data.ts](tools/taskgraph/src/export/graph-data.ts)`
    - `[tools/taskgraph/src/plan-import/importer.ts](tools/taskgraph/src/plan-import/importer.ts)`
  - Replace `raw<{ "COUNT(*)": number }[]>()` with `raw<{ "COUNT(*)": number }>()` in:
    - `[tools/taskgraph/src/domain/invariants.ts](tools/taskgraph/src/domain/invariants.ts)`
  - Replace `raw<Edge[]>()` with `raw<Edge>()` in:
    - `[tools/taskgraph/src/export/graph-data.ts](tools/taskgraph/src/export/graph-data.ts)`
3. **Tighten integration test `exitCode` typing**
  - In `[tools/taskgraph/__tests__/integration/test-utils.ts](tools/taskgraph/__tests__/integration/test-utils.ts)`, avoid destructuring `exitCode` into an implicitly optional flow; normalize with `const exitCode = result.exitCode ?? 0` and typed `unknown` catch handling.
  - Keep function contract `Promise<{ stdout: string; stderr: string; exitCode: number }>` guaranteed.
4. **Validate with focused then full checks**
  - Run targeted typecheck/build for `tools/taskgraph` first to confirm type fixes.
  - If clean, run your full sequence (`build`, `test:e2e`, `test:integration`) in order.

## Notes on Your Draft Plan

- **Keep:** invariants async return consistency, test-utils `exitCode` hardening, full validation run.
- **Adjust:** `query.ts` likely does **not** need more casting changes; it already casts at method boundary. Primary fix is correcting callsite generics from `T[]` to `T`.
- **Likely unnecessary for this error set:** broad tsconfig/lib adjustments unless `_unsafeUnwrap` errors still remain after the above fixes.

