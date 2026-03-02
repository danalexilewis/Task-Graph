# Persistent Memory

Transient dev context. Durable knowledge belongs in `docs/`.
See `.cursor/rules/memory.mdc` for the learnings routing system.

## Feature ideas / backlog

- **Self-healing orphaned tasks** — User wants: if a task is in `doing` state and hasn't been updated for 2+ hours, auto-revert it to `todo`. Prevents orphaned tasks when agent sessions die. Would need a background sweep or `tg reclaim` command that checks `updated_at` on doing tasks and resets them. Discussed in session 2026-03-01.

## Worktree CLI rule (Worktrunk)

- **`pnpm tg` commands CANNOT run from Worktrunk worktrees** — worktrees are sibling dirs (`Repo.tg-abc123`) with no `dist/`, `node_modules/`, or `.taskgraph/`. `readConfig()` uses `process.cwd()` with no directory walking. All `pnpm tg` CLI commands (note, done, status, context) must run from the main repo root. Only file editing and `git add/commit` happen in the worktree.
- **`tg done` reads worktree path from DB** — it derives the repo root from the stored `worktree_path` (strips `.tg-abc123` suffix), so it works correctly when called from the main repo root. The old "CRITICAL — run from worktree" rule was wrong for Worktrunk.

## Meta skill — crossplan analysis tips

- **Startup sequence (saves N per-plan lookups):** `pnpm tg server start` (if down) → `pnpm tg status --projects` → `pnpm tg next --json --limit 50` (all runnable IDs upfront) → `pnpm tg crossplan summary --json > /tmp/crossplan.json`
- **`crossplan summary --json` keys:** `domains`, `skills`, `files`, `proposed_edges`. Files array has `plan_count`/`plan_titles`; proposed_edges are mechanical file-overlap pairs (4000+ in a mature graph — too noisy to act on directly).
- **File name noise:** `files` entries sometimes contain tree diagram prefixes (`│   └──`) — filter/ignore these.
- **Best signal:** Reason about plan _intent and sequence_ rather than the proposed_edges list. Actionable patterns: gate:full readiness, CLI surface changes → downstream benchmarks/doc-reviews, execution tier ordering.

## Active quirks

- **`status-live --json` tests (3) failing in gate:full** — `parseAsync + closeAllServerPools + process.exit(0)` in `src/cli/index.ts` may race with stdout flush when output is piped. Investigate before declaring gate green. Try `process.exitCode = 0` + natural drain instead of `process.exit(0)`.
- **`pnpm test:all` diverges from `gate:full` isolation** — `test:all` runs `bun test __tests__ --concurrent` without db/mcp isolation. mock.module bleed will return for anyone using it. Either fix or remove the script.
- **Terminal-file polling pattern** (long-running shell commands): when a shell command backgrounds, Cursor streams output to `.cursor/projects/.../terminals/<pid>.txt`. Poll with incremental sleeps + tail; stop when `exit_code:` footer appears. Full pattern in `docs/agent-field-guide.md § Shell / Long-Running Commands`. Never chain `sleep N && tail` in one shell call.
- **Orchestrator must never run `pnpm gate:full` directly on `main`** — implementers' changes live in task branches in the plan worktree. Orchestrator dispatches `run-full-suite` as a task to an implementer; that implementer runs gate:full from _inside_ the plan worktree. See docs/agent-contract.md § gate:full Orchestration Rules.
- **Verify plan branch exists before dispatching Wave 1** — after the first `tg start --worktree` for a new plan, run `tg worktree list --json` and confirm a `plan-p-XXXXXX` entry is present. If it's missing, the plan branch was not created; sub-agents' `tg done` calls will clean up the task worktrees without merging, silently destroying all commits. Symptom: task worktrees (tg-XXXXXX) appear but no matching plan-p-\* worktree. Fix: investigate why `plan_worktree` row was not written, or create the plan branch manually before dispatching.
