# Sub-Agent Dispatch Anti-Patterns Investigation

**Date:** 2026-03-01
**Scope:** Why orchestrators run sequential `tg start --worktree` shell calls before dispatch and poll terminal files with `sleep && cat` after dispatch.
**Produced by:** Orchestrator + reviewer sub-agent (research mode) + planner-analyst sub-agent.

---

## Root Cause Analysis

### Anti-pattern 1: Sequential orchestrator pre-start

The orchestrator ran 3 separate shell tool calls — one `pnpm tg start <taskId> --agent implementer-N --worktree` per task — before dispatching any Task tool sub-agents. This was observed in session [Stuck Agent Watchdog execution](46701652-fd15-4dd6-b0f9-5690ca1f0e63).

**Four independent sources in `subagent-dispatch.mdc` cause this:**

| Source                        | Location | Offending passage                                                                                                                                                                                                                              |
| ----------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worktrunk orchestrator bullet | Line 45  | "When dispatching implementers in parallel, use `tg start … --worktree` (from repo root) so each task gets an isolated worktree … pass WORKTREE_PATH in the implementer prompt"                                                                |
| Pattern 1 Step 4              | Line 123 | "Pass WORKTREE_PATH explicitly… from a prior `tg start ... --worktree` plus `tg worktree list --json`"                                                                                                                                         |
| Lifecycle and errors section  | Line 215 | "Every implementer sub-agent must run `tg start` at the start … In Pattern 1, pass the worktree path (WORKTREE_PATH) so the implementer runs from that directory" — split personality: implementer starts it, but orchestrator passes the path |
| Building prompts section      | Line 221 | "For implementer when using worktrees: also pass WORKTREE_PATH — run `tg start` from repo root, then `tg worktree list --json`…" — direct instruction to orchestrator to pre-start                                                             |

**Why the fix (implementer self-start) isn't followed:**
`implementer.md` Step 1 already documents both paths: "When WORKTREE_PATH was passed: cd to it. When not passed: run `tg start --worktree` yourself." The escape hatch is present but not surfaced at the orchestrator level. Additionally, `implementer.md`'s Input Contract (line 19) says "the orchestrator runs `tg start … --worktree` and passes this path" — contradicting Step 1 and reinforcing the pre-start expectation.

**Secondary files that also reinforce pre-start:**

| File                        | Location                                                                        |
| --------------------------- | ------------------------------------------------------------------------------- |
| `.cursor/agents/README.md`  | "How dispatch works" step 5                                                     |
| `docs/leads/execution.md`   | Pattern step 2                                                                  |
| `docs/agent-field-guide.md` | Worktree Workflow comment ("Step 1: Start (orchestrator passes WORKTREE_PATH)") |

**Why sequential and not batched:** The batching instruction ("emit all N calls in the SAME message") applies exclusively to Task tool dispatches. For shell commands, the rule uses "for each task…" framing with no batching directive. The natural execution model is a sequential for-loop. There is no instruction to batch or parallelize the `tg start` shell calls themselves.

---

### Anti-pattern 2: Terminal-file polling after Task tool dispatch

After dispatching implementers, the orchestrator ran `sleep 15 && cat /terminals/615024.txt | tail -30`.

**No instruction source exists for this** — neither `subagent-dispatch.mdc` nor `implementer.md` mentions `sleep`, `cat`, or terminal-file polling.

**How it emerges:**

1. Terminal-file polling is documented prominently for backgrounded shell commands (`taskgraph-workflow.mdc` line 19, `docs/agent-contract.md` lines 90–92).
2. Pattern 1 Step 6 says only "Wait for all to complete" — no statement that Task tool calls auto-await.
3. After running N sequential shell commands for pre-start, the orchestrator is in "shell mode." When it reaches the dispatch step and needs to wait, it applies the terminal-monitoring pattern by analogy.
4. Task tool calls are synchronous and return results directly to the orchestrator — no polling is needed or useful. This is never stated in the rule.

---

## Files to Change

| File                                   | Change needed                                                                                             |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `.cursor/rules/subagent-dispatch.mdc`  | 4 edits: Worktrunk bullet, Step 4 WORKTREE_PATH framing, Step 5 auto-await note, Building prompts section |
| `.cursor/rules/taskgraph-workflow.mdc` | Add parenthetical: polling is for shell commands only, not Task tool calls                                |
| `.cursor/agents/implementer.md`        | Input Contract: mark `{{WORKTREE_PATH}}` explicitly optional                                              |
| `.cursor/agents/README.md`             | "How dispatch works" step 5: self-start as default                                                        |
| `docs/leads/execution.md`              | Pattern step 2: self-start as default                                                                     |
| `docs/agent-field-guide.md`            | Worktree Workflow example: self-start as primary path                                                     |

---

## Recommendations

1. **(Highest leverage)** Rewrite `subagent-dispatch.mdc` Worktrunk orchestrator bullet: make self-start the explicit default; pre-start becomes a named opt-in for when `plan_branch` from the started event is needed before building prompts.
2. Add to Pattern 1 Step 4: "Do not pre-start worktrees as separate shell calls before dispatch — omit `{{WORKTREE_PATH}}` and let each implementer self-start in Step 1."
3. Add to Pattern 1 Step 5: "Task tool calls are synchronous — they block until the sub-agent returns. Do not poll terminal files to monitor them."
4. Update all six secondary files to match (all parallel, different files, no conflicts).

A plan (`plans/26-03-01_fix_subagent_dispatch_antipatterns.md`) has been created with 6 parallel documenter tasks covering all the above.

---

## Summary

Orchestrators pre-start worktrees sequentially because four independent passages in `subagent-dispatch.mdc` instruct or imply that the orchestrator runs `tg start --worktree` for each task — even though `implementer.md` Step 1 already handles self-start when `WORKTREE_PATH` is omitted. The terminal-polling pattern has no instruction source; it bleeds in from shell-command monitoring docs and gets misapplied to Task tool dispatches, which auto-await and need no polling. Both are fixable with targeted wording changes to one primary file and five secondary files.
