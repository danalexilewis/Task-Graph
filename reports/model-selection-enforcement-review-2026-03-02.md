# Model Selection Enforcement Review

**Date:** 2026-03-02
**Scope:** Audit of `model="fast"` enforcement across all rules, skills, and agent profiles — triggered by observed implementer sub-agents inheriting the expensive session model instead of using fast.
**Produced by:** Investigator sub-agent (code health audit) + orchestrator synthesis.

---

## Background

The system dispatches implementer sub-agents via the Cursor Task tool. The `model` parameter on that call determines cost. Rule: implementers and documenters must use `model="fast"`; analysts, reviewers, investigators, and fixers must omit `model` (inherit session model = Sonnet/Opus for reasoning quality). The concern: if the orchestrator omits `model="fast"` when dispatching implementers, they silently inherit an expensive model. The rules define the intent but were not consistently co-located with the actual dispatch call sites.

---

## Files Reviewed

| File                         | Model selection content                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `subagent-dispatch.mdc`      | Rule stated in "Dispatch mechanisms" section (line 50) — but separate from the numbered Pattern 1/2 dispatch steps |
| `taskgraph-workflow.mdc`     | No mention; defers to `subagent-dispatch.mdc`                                                                      |
| `available-agents.mdc`       | Fast/inherit noted in key-boundaries prose; no model column in main table                                          |
| `session-start.mdc`          | Model guidance table is correct and clear                                                                          |
| `work/SKILL.md`              | Loop step 6d explicitly includes `model=fast` inline with pseudocode — correct                                     |
| `plan/SKILL.md`              | Gold standard: Architecture table has Model column; dispatch step says "do NOT pass `model="fast"`"                |
| `investigate/SKILL.md`       | No model mention; also Step 4 names wrong agent (investigator vs reviewer research mode)                           |
| `review/SKILL.md`            | No model mention; inherit-tier agents used, so safe by default but not explicit                                    |
| `evolve/SKILL.md`            | Architecture table has Model column with explicit inherit note — correct                                           |
| `audit-performance/SKILL.md` | No model mention; explore-type scanners default to fast but not stated                                             |
| `debug/SKILL.md`             | No Model column in Architecture table; dispatches both fast and inherit agents                                     |
| `implementer.md`             | `## Model` section says `fast`; prompt body says "Use model=fast" (self-referential — see Gap 5)                   |
| `reviewer.md`                | `## Model` section: inherit, explicit "do NOT pass `model="fast"`" — correct                                       |
| `investigator.md`            | `## Model` section: inherit, explicit — correct                                                                    |
| `planner-analyst.md`         | `## Model` section: inherit, explicit — correct                                                                    |
| `fixer.md`                   | `## Model` section: inherit, explicit — correct                                                                    |
| `documenter.md`              | `## Model` section: `fast`; prompt body self-referential loop (same issue as implementer)                          |
| `debugger.md`                | `## Model` section: `fast` with escalation note                                                                    |
| `agents/README.md`           | Model tier table is correct; intro paragraph and step 4 conflict (see Gap 1)                                       |
| `AGENT.md`                   | Execution loop: no model mention; implicit deferral to subagent-dispatch                                           |

---

## Gaps Found

### GAP 1 — `agents/README.md` intro paragraph contradicts itself (HIGH)

**Location:** `agents/README.md`, "How dispatch works" section — introductory paragraph vs. step 4.

**Issue:** The intro ends with "use `model="fast"` when using the Task tool or CLI" — this reads as if ALL agents use fast. Step 4 in the same section correctly says "Pass `model="fast"` for fast-tier agents; omit `model` for inherit-tier agents." An orchestrator skimming this section takes the wrong rule from the first paragraph it hits.

**Suggested fix:** Rewrite the end of the intro: change "use `model="fast"` when using the Task tool or CLI" → "see the Model tier table above — pass `model="fast"` for fast-tier agents and omit `model` for inherit-tier agents."

---

### GAP 2 — Debugger tier conflicts between `agents/README.md` and `debugger.md` (HIGH)

**Location:** `agents/README.md` model tier table vs. `debugger.md` `## Model` section.

**Issue:** `README.md` places debugger in the **inherit** tier. `debugger.md` says **fast** ("bounded, phase-driven debugging" with escalation). Direct contradiction — different dispatch behavior depending on which file an orchestrator reads first.

**Suggested fix:** Decide canonical tier. `debugger.md`'s rationale ("bounded, phase-driven, same as implementer") is sound — move debugger to the **fast** tier in `README.md`, noting that the orchestrator may escalate to a stronger model after 3 failed attempts.

---

### GAP 3 — Pattern 1/2 dispatch steps omit model in `subagent-dispatch.mdc` (MEDIUM)

**Location:** `subagent-dispatch.mdc`, Pattern 1 step 6 and Pattern 2 step 3.

**Issue:** The model rule is in "Dispatch mechanisms" (a separate section) but not inline with the numbered dispatch steps, which are the natural entry point when executing a plan. An orchestrator following the steps never sees it.

**Suggested fix:** Add a parenthetical to Pattern 1 step 6 and Pattern 2 step 3: "Dispatch … (Task tool with `model="fast"` for implementers and documenters; omit `model` for reviewers, analysts, and investigators)."

---

### GAP 4 — `AGENT.md` execution loop has no model mention (MEDIUM)

**Location:** `AGENT.md`, agent operating loop.

**Issue:** "dispatch implementer (Task tool, agent CLI, or mcp_task)" with no model parameter. An agent bootstrapping purely from `AGENT.md` produces implementer dispatch calls with no model, causing inherit.

**Suggested fix:** Add one line: "Use `model="fast"` when dispatching implementers; omit `model` for reviewers and analysts (they inherit the session model)."

---

### GAP 5 — Prompt template body says "Use model=fast" — has no effect on dispatch (LOW)

**Location:** `implementer.md` prompt template (line 76), `documenter.md` prompt template.

**Issue:** The model is determined by the Task tool `model` parameter set by the orchestrator before the sub-agent starts. "Use model=fast" in the prompt body is received by the already-running sub-agent; it cannot change the model. An orchestrator might (incorrectly) reason that the template handles model selection.

**Suggested fix:** Remove "Use model=fast" from the prompt body. Replace the passive Purpose section ("You are always dispatched with `model="fast"`") with an active caller instruction: "**Dispatch with `model="fast"`** — this agent runs on the fast model tier."

---

### GAP 6 — `debug/SKILL.md` Architecture table has no Model column (MEDIUM)

**Location:** `debug/SKILL.md` architecture table.

**Issue:** Dispatches both an investigator (inherit) and implementer (fast) with no model guidance.

**Suggested fix:** Add Model column matching `plan/SKILL.md` pattern: investigator = inherit, implementer = fast.

---

### GAP 7 — `investigate/SKILL.md` Step 4 names wrong agent (MEDIUM)

**Location:** `investigate/SKILL.md`, Step 4, item 3.

**Issue:** Says "call the **investigator** sub-agent" but the skill's purpose, architecture, and permissions sections all specify the **reviewer in research mode** (read-only). The investigator is the hunter-killer (read-write, fixes things). Same model tier, but wrong template and wrong permissions.

**Suggested fix:** Fix Step 4 item 3: "Call only the **reviewer** sub-agent in **research mode** (read-only, `readonly=true`). Use the research-mode prompt template from `.cursor/agents/reviewer.md`."

---

### GAP 8 — `audit-performance/SKILL.md` model implicit only (LOW)

**Location:** `audit-performance/SKILL.md` — 6 parallel scanners dispatched with no model guidance.

**Issue:** `explore`-type scanners default to fast but this isn't stated; `generalPurpose` inherits.

**Suggested fix:** Add a note: "Scanners dispatched as `explore` type use `model="fast"` automatically. Pre-compute and synthesis agents omit `model` (inherit session model)."

---

## What's Working

- `plan/SKILL.md` — gold standard: Architecture table has Model column, dispatch steps explicit
- `work/SKILL.md` — `model=fast` inline with pseudocode dispatch call in loop step 6d
- `evolve/SKILL.md` — Architecture table has Model column, explicit "do NOT pass `model="fast"`"
- All inherit-tier agent `## Model` sections (`reviewer.md`, `investigator.md`, `planner-analyst.md`, `fixer.md`) — explicit and correct
- `subagent-dispatch.mdc` "Dispatch mechanisms" section — clear unambiguous statement of the full rule
- `session-start.mdc` model guidance table — correct

---

## Recommended Fixes (Prioritised)

| Priority | Fix                                                                                | File(s)                           | Effort |
| -------- | ---------------------------------------------------------------------------------- | --------------------------------- | ------ |
| 1        | Remove contradictory "use `model="fast"` when using the Task tool" sentence        | `agents/README.md`                | Tiny   |
| 2        | Resolve debugger tier conflict (fast vs inherit)                                   | `agents/README.md`, `debugger.md` | Tiny   |
| 3        | Add `model="fast"` inline to Pattern 1 step 6 and Pattern 2 step 3                 | `subagent-dispatch.mdc`           | Small  |
| 4        | Add model selection line to AGENT.md execution loop                                | `AGENT.md`                        | Tiny   |
| 5        | Fix `investigate/SKILL.md` Step 4 to name reviewer (not investigator)              | `investigate/SKILL.md`            | Tiny   |
| 6        | Add Model column to `debug/SKILL.md` Architecture table                            | `debug/SKILL.md`                  | Small  |
| 7        | Replace self-referential "Use model=fast" in prompt bodies with caller instruction | `implementer.md`, `documenter.md` | Small  |
| 8        | Add model note to `audit-performance/SKILL.md`                                     | `audit-performance/SKILL.md`      | Tiny   |

---

## System Health (context)

- **Dolt server not running** at time of review — `tg status` unavailable during sub-agent run
- **3 gate:full tests failing** — `status-live --json` stdout flush race; fix is `process.exitCode = 0` instead of `process.exit(0)` in `src/cli/index.ts`
- **~50 uncommitted files** — benchmarking work from today's session; checkpoint commit recommended
- **`typescript` pinned at `^5.3.3`** — current is 5.8.x; low urgency bump

---

## Summary

The model selection rules are correctly stated in authoritative locations, but enforcement is fragile — the rule lives in a separate section from the actual dispatch call sites, so an orchestrator following the numbered Pattern 1/2 steps will miss it. Two direct contradictions in `agents/README.md` (all-agents-use-fast sentence, debugger tier conflict) are the highest-priority fixes. Closing these gaps requires small targeted edits to 6–8 files; the `plan/SKILL.md` + `work/SKILL.md` pattern (model inline with dispatch pseudocode, explicit Architecture table Model column) is the right template to replicate everywhere.
