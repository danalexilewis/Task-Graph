# Skill: Neverthrow error handling

## Purpose

Use `Result` and `ResultAsync` from neverthrow so errors are explicit and propagated to the CLI boundary without throwing. Ensures consistent `AppError` codes and messages and a single place (the command handler) where we exit the process.

## Inputs

- Operation that can fail (DB, file, parse, validation)
- `src/domain/errors.ts` (ErrorCode, AppError, buildError)
- Existing code in `db/`, `domain/`, `plan-import/`, `cli/` as reference

## Steps

1. For sync code: return `Result<T, AppError>` using `ok(value)` or `err(buildError(ErrorCode.X, "message", cause))`.
2. For async code: return `ResultAsync<T, AppError>`. Use `ResultAsync.fromPromise(promise, (e) => buildError(...))` or chain with `.andThen()`, `.map()`, `.mapErr()`.
3. Use `buildError(code, message, cause?)` for all failures; pick the right ErrorCode (e.g. DB_QUERY_FAILED, TASK_NOT_FOUND, VALIDATION_FAILED).
4. Chain operations with `.andThen()` so the next step runs only on success; use `.mapErr()` to transform errors if needed.
5. At the CLI boundary (command `action` handler): await the ResultAsync, then call `.match((data) => { ... }, (error) => { console.error(...); process.exit(1); })`. Optionally output JSON on error when `--json` is set.
6. Do not use `throw` or `try/catch` for expected failures; reserve throws for programming bugs if at all.

## Gotchas

- `ResultAsync.fromPromise(promise, errorMapper)` needs an error mapper that turns the rejection into `AppError`; the second arg is (e) => AppError.
- When you need to branch on success/failure inside a chain, use `.andThen((value) => ...)` and return a Result/ResultAsync from the callback; use `errAsync(buildError(...))` for an immediate failure branch.
- Unwrap only at the CLI boundary with `.match()`. Avoid `.._unsafeUnwrap()` except in tests or init where you intend to throw on failure.
- If a function calls another that returns Result/ResultAsync, it should return Result/ResultAsync as well (or use .match() and re-wrap).

## Definition of done

- All failure paths return `err(buildError(...))` or `errAsync(...)`; no unhandled throws for expected errors.
- CLI handlers use `.match()` and call `process.exit(1)` on err.
- Error codes and messages are consistent with `docs/error-handling.md`.
