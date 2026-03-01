# Lead: Execution

Created by the **/work** skill. Autonomous task execution loop: grind through plan tasks using sub-agent dispatch without stopping for human confirmation.

## When

Invoked when the user says **/work**, **go**, **execute**, or **grind**.

## Agent files (workers)

- **implementer.md** — does the work (code, tests, docs).
- **reviewer.md** — evaluates implementation against the spec (quality check).
- **spec-reviewer**, **quality-reviewer** — two-stage review: spec compliance then quality.

## Pattern

1. **Loop:** `tg next` (plan name or multi-plan) -> get runnable tasks.
2. **Dispatch:** Use **Worktrunk** for worktree isolation when available (config `useWorktrunk: true` or `wt` on PATH). **Default:** pre-start each task (run `tg start <taskId> --agent <name> --worktree`), get worktree path from `tg worktree list --json`, and inject **`{{WORKTREE_PATH}}`** so implementers skip claiming and path lookup. Implementers then `cd {{WORKTREE_PATH}}` and start work. Capture `plan_branch` on first start per plan for **`{{PLAN_BRANCH}}`**. Send runnable non-conflicting tasks in parallel (one task per implementer); Cursor decides concurrency.
3. **Review:** Two-stage — spec-reviewer then quality-reviewer (or reviewer when single-stage).
4. **Repeat** until no runnable tasks or plan complete.

Orchestrator coordinates; implementers and reviewers are workers.

## Safeguards

- **File conflict check** — avoid assigning tasks that touch the same files to different agents in the same batch.
- **Three-layer watchdog** — prevents stuck sub-agents from hanging the loop:
  - Layer 1: Implementer self-awareness (`implementer.md` loop budget — agent exits with VERDICT: FAIL on stuck-loop detection)
  - Layer 2: Orchestrator terminal-monitoring protocol (`work/SKILL.md -> Sub-Agent Watchdog Protocol` — `block_until_ms: 600000`, terminal read, stall heuristics, PID kill, route to fixer/re-dispatch/investigator)
  - Layer 3: Optional bash overseer daemon (`scripts/overseer.sh` — monitors worktree filesystem activity every 180s)
- **Follow-up from notes** — if implementer or notes mention env issues, gate failures, or suggested follow-up, orchestrator may create follow-up tasks and delegate.
- **Escalation after 2 failures** — if a reviewer fails the same task twice, fall back to direct execution (orchestrator does the work).

## Input

- **Plan name** (single plan), or **multi-plan** (multiple plans) — determines which tasks are runnable via `tg next`.

## Output

- **Progress per batch** — which tasks were dispatched, completed, or failed each round.
- **Final summary** — plan(s) completed, tasks done, any follow-up or failures.

## See also

- `.cursor/skills/work/SKILL.md` — work skill definition.
- `.cursor/rules/subagent-dispatch.mdc` — dispatch patterns and task orchestration UI.
- `docs/leads/README.md` — lead registry.
