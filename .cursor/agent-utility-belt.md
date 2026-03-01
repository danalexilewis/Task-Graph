# Agent utility belt

Shared learnings for all agent personas and sub-agents. When building prompts or dispatching implementers, reviewers, fixers, investigators, or other sub-agents, ensure they have access to this doc (e.g. inject as `{{LEARNINGS}}` or instruct them to read it). Skills that invoke agents should reference it.

---

## Result / error handling

- **[2026-03-01]** `ResultAsync.fromPromise` error mapper written as `(e) => e as AppError` — unsafe cast; runtime exceptions are silently miscast. Instead: `(e) => buildError(ErrorCode.UNKNOWN_ERROR, e instanceof Error ? e.message : String(e), e)`.
- **[2026-03-01]** In `ResultAsync.fromPromise` and catch blocks, do not use `(e as Error).message` — non-Error rejections can throw. Use `e instanceof Error ? e.message : String(e)` for the message and pass the rejection as the third argument to `buildError`.
- **[2026-03-01]** When building `AppError` from script or subprocess output (e.g. `out.error`), pass the raw output or parsed object as the third argument (cause) to `buildError` so logs and tools can inspect it.
- **[2026-03-01]** Async IIFE + `throw result.error` inside `ResultAsync.fromPromise((async () => {})(), ...)` — hybrid paradigm that tempts the unsafe error mapper. Prefer `.andThen()` chains; only use the IIFE when sequential logic is genuinely too complex to chain.

## SQL / DB

- **[2026-03-01]** Batch CLI multi-ID pattern: use `parseIdList(ids)` from `src/cli/utils.ts`, resolve config explicitly before the loop, accumulate per-ID results into `{ id, status } | { id, error }` array, set `anyFailed` flag and `process.exit(1)` after reporting all. Do NOT nest a `for` loop inside `asyncAndThen` — partial-failure accumulation is impossible inside a monadic chain.
- **[2026-03-01]** 2+ independent queries should not be nested `.andThen()` chains — that runs them serially. Use `ResultAsync.combine([q.raw(sql1), q.raw(sql2)])` for parallel execution. Nested `.andThen()` is correct only when one query depends on the previous result.
- **[2026-03-01]** Dolt does NOT auto-create secondary indexes for FK declarations (unlike MySQL InnoDB). Every FK column and every high-frequency filter column (WHERE, JOIN subquery) needs an explicit `CREATE INDEX idx_<table>_<col>` in the same migration.
- **[2026-03-01]** `ensureMigrations` probes spawn a dolt subprocess each. When adding a migration, batch `tableExists`/`columnExists`/`viewExists` checks into as few probes as possible. Every new probe adds to every CLI command cold-start.
- **[2026-03-01]** Migration calling `doltCommit` unconditionally creates spurious empty Dolt commits on idempotent re-runs. Guard: `let changed = false; if (!exists) { runDDL(); changed = true; } if (changed) { doltCommit(...); }`.
- **[2026-03-01]** `dolt sql-server` spawned with `stdio: "ignore"` — startup panics invisible; only signal was "did not become ready after 50 attempts". Add an `"exit"` event listener in the polling loop: if `child.exitCode !== null`, throw immediately. Prefer `stdio: "pipe"` in test infra setup.

## CLI conventions

- **[2026-03-01]** CLI command renames must be immediately followed by a grep sweep of `.cursor/agents/*.md` and `.cursor/rules/*.mdc` for stale references. Treat a CLI rename the same as a public API rename.
- **[2026-03-01]** New CLI flags on `tg done`/`tg start` won't be used by agents until they appear in agent templates. When new flags are added to task-graph CLI commands, update all agent templates that call those commands immediately.
- **[2026-03-01]** Extract domain-style logic (e.g. group-by agent, sort, latest-per-key) from command handlers into pure functions; keep handlers to config read, call pure fn, then format/output. Do not put large aggregation blocks inside `.match()` callbacks.
- **[2026-03-01]** When multiple subcommands share the same sequence (readConfig → isErr exit → path resolution → operation → .match err handling), deduplicate via a shared helper (e.g. `withConfig(cmd, fn)`) so each action only supplies the operation.

## Test infrastructure

- **[2026-03-01]** Sending SIGTERM to the bare PID of a `detached: true` process leaves children alive. Kill the entire process group: `process.kill(-pid, "SIGTERM")`. Add SIGKILL fallback after ~200 ms.
- **[2026-03-01]** Post-spawn setup steps (migrations, env vars, port reservation) without try/finally can orphan server processes. Enter a try block immediately after receiving the PID; kill the process group in the `finally`/`catch` before re-throwing.
- **[2026-03-01]** Spawned server PIDs stored only in-memory are lost on force-kill. Write PID to file immediately after spawn; teardown reads and cleans up that file, not just the JS variable.
- **[2026-03-01]** Test suites starting external processes need OS-level leak assertions: `pgrep -c dolt` before and after the full suite. 80 orphaned dolt processes accumulated with no reporter signal.
- **[2026-03-01]** `process.env.VAR = value` in `beforeAll`/`beforeEach` without matching `delete process.env.VAR` in teardown — Bun runs files in the same process; stale env vars leaked between test files and caused `ECONNREFUSED`.
- **[2026-03-01]** `gate:full` run on a plan branch without a baseline on `main` — ~80% of failures were pre-existing, wasting investigator cycles. Cross-check against base branch first or note "pre-existing" in evidence for failures in unchanged code.

## Types

- **[2026-03-01]** Script/output interfaces that represent a fixed JSON contract (e.g. query script stdout) should list only the known optional fields; avoid `[key: string]: unknown` if the shape is fixed so the type documents the contract.

## Worktree / execution

- **[2026-03-01]** `tg start --force` attempted when an aborted sub-agent's task branch already existed — failed with "Worktrunk worktree create failed". `--force` overrides the claim check but not branch creation. When a sub-agent is aborted and a live worktree exists: `tg worktree list --json`, find the entry, `cd` to its `path`, continue directly without re-running `tg start`.
- **[2026-03-01]** Env-var activation function set only one of two required vars. `getServerPool()` guards on both `TG_DOLT_SERVER_PORT` and `TG_DOLT_SERVER_DATABASE`; setting only one returns `null` silently. Before writing an env-var activation function, read the consumer's entry guard to enumerate every required var; set them all atomically.
