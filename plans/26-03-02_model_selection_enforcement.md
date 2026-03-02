---
name: Model Selection Enforcement - Fix Rules and Skills
overview: Fix 8 gaps where model="fast" is missing or contradicted in rules, skills, and agent profiles so orchestrators see the rule inline at every dispatch call site.
fileTree: |
  .cursor/
  ├── agents/
  │   ├── README.md              (modify - GAP 1, GAP 2, Additional A)
  │   ├── implementer.md         (modify - GAP 5)
  │   └── documenter.md          (modify - GAP 5)
  ├── rules/
  │   └── subagent-dispatch.mdc  (modify - GAP 3, Additional B)
  ├── skills/
  │   ├── investigate/SKILL.md   (modify - GAP 7, Additional C)
  │   ├── debug/SKILL.md         (modify - GAP 6)
  │   └── audit-performance/SKILL.md (modify - GAP 8)
  AGENT.md                       (modify - GAP 4)
risks:
  - description: subagent-dispatch.mdc is the most-referenced rule; changes must be additive (insert parentheticals only, no structural changes)
    severity: low
    mitigation: All changes are additive text additions or sentence rewrites. No structural changes to patterns.
  - description: Debugger tier resolution (fast vs inherit) has downstream consequences
    severity: low
    mitigation: debugger.md already says "fast" with escalation path documented. Fix README.md to match; keep the escalation note visible.
todos:
  - id: fix-readme-tier-table
    content: "Fix agents/README.md - remove contradictory intro sentence and correct model tier table"
    agent: documenter
    changeType: modify
    intent: |
      Fix two issues in `.cursor/agents/README.md`:

      1. **GAP 1 - Contradictory intro sentence.** In the "How dispatch works" section, the introductory paragraph ends with:
         > "dispatch (Task tool, agent CLI, or mcp_task) with the built prompt; use `model="fast"` when using the Task tool or CLI."
         This implies ALL agents use fast. Rewrite the end of that sentence to:
         > "dispatch (Task tool, agent CLI, or mcp_task) with the built prompt; see the Model tier table above — pass `model=\"fast\"` for fast-tier agents and omit `model` for inherit-tier agents."

      2. **GAP 2 + Additional A - Tier table errors.** The model tier table currently reads:
         > fast: implementer, explorer, test-quality-auditor, test-infra-mapper, test-coverage-scanner
         > inherit: planner-analyst, spec-reviewer, quality-reviewer, reviewer, fixer, investigator, debugger

         Two fixes needed:
         a. Move `debugger` from inherit to fast tier. `debugger.md` correctly says `fast` ("bounded, phase-driven debugging"); README contradicts it. Keep the escalation note that the orchestrator may use a stronger model after 3 failed attempts.
         b. Add `documenter` to the fast tier list. `documenter.md` says `fast` but README omits it entirely.

      After fixes the fast tier should read:
      > fast: implementer, documenter, debugger, explorer, test-quality-auditor, test-infra-mapper, test-coverage-scanner
    suggestedChanges: |
      In the "How dispatch works" intro paragraph, find and replace:
        "use `model=\"fast\"` when using the Task tool or CLI"
      with:
        "see the Model tier table above — pass `model=\"fast\"` for fast-tier agents and omit `model` for inherit-tier agents"

      In the tier table, move `debugger` from the inherit list to the fast list, and add `documenter` to the fast list alongside `implementer`.

      Add a note after the tier table entry for `debugger` (or in a sub-bullet): "The orchestrator may escalate debugger to a stronger model after 3 failed attempts — see debugger.md."

  - id: fix-dispatch-patterns
    content: "Fix subagent-dispatch.mdc - add model parentheticals to Pattern 1 step 6 and Pattern 2 step 3"
    agent: documenter
    changeType: modify
    intent: |
      Fix two issues in `.cursor/rules/subagent-dispatch.mdc`:

      1. **GAP 3 - Pattern 1 step 6 and Pattern 2 step 3 omit model.** An orchestrator following the numbered steps never sees the model rule.

         Pattern 1 step 6 currently reads:
         > "**Dispatch** all tasks in the batch **in the same response** (one Task or mcp_task call per task in the batch). Do not dispatch one task per turn..."
         Add a parenthetical: "(use `model=\"fast\"` for implementers and documenters; omit `model` for reviewers, analysts, and investigators)"

         Pattern 2 step 3 currently reads:
         > "**Dispatch** one implementer (Task tool, agent CLI, or mcp_task) with the built prompt and description "Implement: <title>"."
         Add after description: "(use `model=\"fast\"`)"

      2. **Additional B - Dispatch mechanisms section (line 50) says "implementers only" but should include documenters.** Current:
         > "Use `model=\"fast\"` for **implementers** only."
         Change to:
         > "Use `model=\"fast\"` for **implementers and documenters** only."
    suggestedChanges: |
      Pattern 1 step 6: after the opening "**Dispatch** all tasks in the batch **in the same response**", add:
        "(Task tool with `model=\"fast\"` for implementers and documenters; omit `model` for reviewers, analysts, and investigators)"

      Pattern 2 step 3: after "description "Implement: <title>"", add:
        "(use `model=\"fast\"`)"

      Dispatch mechanisms section: change "for **implementers** only" to "for **implementers and documenters** only".

  - id: fix-agent-md-loop
    content: "Fix AGENT.md - add model selection line to execution loop"
    agent: documenter
    changeType: modify
    intent: |
      **GAP 4.** `AGENT.md`'s agent operating loop says:
      > "build implementer prompt from tg context and `.cursor/agents/implementer.md`; dispatch implementer (Task tool, agent CLI, or mcp_task per subagent-dispatch)."

      An agent bootstrapping purely from AGENT.md has no model guidance. Add one sentence immediately after the dispatch instruction:
      > "Use `model=\"fast\"` when dispatching implementers and documenters; omit `model` for reviewers, analysts, and investigators (they inherit the session model)."

      This is the minimum addition to close the cold-start gap.
    suggestedChanges: |
      Find the line in the agent operating loop that references dispatching the implementer.
      After that dispatch instruction, add on a new line:
        "Use `model=\"fast\"` when dispatching implementers and documenters; omit `model` for reviewers, analysts, and investigators (they inherit the session model)."

  - id: fix-investigate-skill
    content: "Fix investigate/SKILL.md - Step 4 and Step 5 name wrong agent (investigator vs reviewer)"
    agent: documenter
    changeType: modify
    intent: |
      **GAP 7 + Additional C.** `.cursor/skills/investigate/SKILL.md` has a direct contradiction:
      - The Architecture table, Rules section, and a final "Not the investigator" note all correctly specify the **reviewer in research mode**
      - Step 4 item 3 (and Step 5) incorrectly say "**investigator** sub-agent" and reference `investigator.md`

      The investigator is the hunter-killer (read-write, debug+fix). Using it in this skill violates read-only constraints.

      Fix Step 4 item 3:
      Current: "Call **only** the **investigator** sub-agent (read-only). Use the prompt template from `.cursor/agents/investigator.md`"
      Change to: "Call **only** the **reviewer** sub-agent in **research mode** (read-only, `readonly=true`). Use the research-mode prompt template from `.cursor/agents/reviewer.md`"

      Fix Step 5 (line referencing "Merge the investigator's findings"):
      Change "investigator's" to "reviewer's" throughout Step 5.

      Do NOT change the Architecture table or the "Not the investigator" note — they are already correct.
    suggestedChanges: |
      In Step 4 item 3: replace "investigator sub-agent" with "reviewer sub-agent in research mode" and replace reference to "investigator.md" with "reviewer.md".
      In Step 5: replace "investigator's findings" with "reviewer's findings".

  - id: fix-debug-skill-model-column
    content: "Add Model column to debug/SKILL.md Architecture table"
    agent: documenter
    changeType: modify
    intent: |
      **GAP 6.** `.cursor/skills/debug/SKILL.md`'s Architecture table currently has no Model column:

      ```
      | Agent        | Purpose                           | Permission  |
      | ------------ | --------------------------------- | ----------- |
      | investigator | Root cause and pattern analysis   | read-only   |
      | implementer  | Single-change fixes, verification | read+write  |
      ```

      This skill dispatches both an inherit-tier agent (investigator) and a fast-tier agent (implementer). Add a Model column following the `plan/SKILL.md` gold standard:

      ```
      | Agent        | Purpose                           | Permission  | Model                   |
      | ------------ | --------------------------------- | ----------- | ----------------------- |
      | investigator | Root cause and pattern analysis   | read-only   | inherit (session model) |
      | implementer  | Single-change fixes, verification | read+write  | fast                    |
      ```

      Also add a note on the investigator dispatch step: "do NOT pass `model=\"fast\"`" (same pattern as plan/SKILL.md Phase 1 step 4).
    suggestedChanges: |
      Add a Model column to the Architecture table with:
        - investigator: "inherit (session model)"
        - implementer: "fast"
      Add a parenthetical to the investigator dispatch step: "(omit `model` — investigator inherits the session model)"
      Add a parenthetical to the implementer dispatch step: "(use `model=\"fast\"`)"

  - id: fix-prompt-body-model-instructions
    content: "Fix implementer.md and documenter.md - replace self-referential 'Use model=fast' with caller instruction"
    agent: documenter
    changeType: modify
    intent: |
      **GAP 5.** Both `implementer.md` and `documenter.md` have "Use model=fast" inside the prompt body:

      `implementer.md` prompt body (first line):
      > "You are the Implementer sub-agent. You execute exactly one task from the task graph. Use model=fast."

      `documenter.md` prompt body (first line):
      > "You are the Documenter sub-agent. You execute exactly one documentation-only task from the task graph. Use model=fast."

      This instruction is received by the already-running sub-agent; it cannot retroactively change the model. The model is determined by the Task tool `model` parameter set by the orchestrator BEFORE the sub-agent starts.

      Fix: Remove "Use model=fast." from the prompt body opening line (the sub-agent cannot act on it).

      The `## Purpose` section in each file already has the passive form "You are always dispatched with `model=\"fast\"`" — change this to an active caller-facing instruction that makes clear the orchestrator must set this:
      > "**Always dispatch with `model=\"fast\"`** — this agent runs on the fast model tier. The orchestrator sets `model=\"fast\"` in the Task tool call; the sub-agent cannot change its own model."

      The `## Model` section already correctly states `fast` — no change needed there.
    suggestedChanges: |
      In both implementer.md and documenter.md:
      1. In the prompt template body, remove "Use model=fast." from the opening line (leave the rest of the sentence intact).
      2. In the ## Purpose section, replace the passive "You are always dispatched with `model=\"fast\"`" with:
         "**Always dispatch with `model=\"fast\"`** — this agent runs on the fast model tier. The orchestrator sets `model=\"fast\"` in the Task tool call."

  - id: fix-audit-performance-skill
    content: "Add Model column/note to audit-performance/SKILL.md Architecture table"
    agent: documenter
    changeType: modify
    intent: |
      **GAP 8.** `.cursor/skills/audit-performance/SKILL.md`'s Architecture table has no Model column. It dispatches 6 parallel sub-agents (pre-compute + 5 scanners) with no model guidance.

      All 5 scanners use `explore`-type dispatch which defaults to fast. The pre-compute setup agent and synthesis lead (the orchestrator) are generalPurpose/inherit. This is correct but implicit.

      Add a Model column to make it explicit, following the `plan/SKILL.md` pattern:
        - Lead (orchestrator): inherit (session model)
        - pre-compute agent: inherit (generalPurpose — summarises context)
        - All 5 scanners (schema-profiler, query-auditor, hotpath-tracer, anti-pattern-scanner, dolt-specialist): fast

      Also add a brief note in the scanner dispatch step: "Dispatch all 5 scanners with `model=\"fast\"` (explore type); omit `model` for the pre-compute setup agent."
    suggestedChanges: |
      Add a Model column to the Architecture table:
        - Lead (you): "inherit (session model)"
        - pre-compute agent: "inherit"
        - Each scanner row: "fast"
      Add a note in the parallel scanner dispatch instructions: "(dispatch scanners with `model=\"fast\"`; pre-compute agent omits `model`)"
isProject: false
---

## Analysis

All 8 fixes address the same root cause: the `model="fast"` rule is correctly stated in authoritative locations but not co-located with the actual dispatch call sites. An orchestrator following numbered steps in any pattern can reach the dispatch call without having read the rule section. The fixes are purely additive text changes — no structural changes to patterns, no behavior changes to the system. All tasks are documentation edits to distinct files with no dependencies between them.

The debugger tier decision (Task 1) deserves a note: `debugger.md` has always said `fast` with an escalation path for hard failures. `README.md` incorrectly inherited the old `investigator=inherit` pattern when the debugger was carved out. Aligning README.md with the file that defines the agent is the right call.

The `investigate/SKILL.md` agent naming fix (Task 4) is the most impactful correctness fix — it currently names the read-write hunter-killer agent for a read-only skill, which would give any orchestrator following it the wrong template and permissions.

## Dependency graph

All 7 tasks are fully independent — no file overlap. They can all run in parallel in a single wave.

```
Parallel start (7 unblocked):
  ├── fix-readme-tier-table              (agents/README.md)
  ├── fix-dispatch-patterns              (rules/subagent-dispatch.mdc)
  ├── fix-agent-md-loop                  (AGENT.md)
  ├── fix-investigate-skill              (skills/investigate/SKILL.md)
  ├── fix-debug-skill-model-column       (skills/debug/SKILL.md)
  ├── fix-prompt-body-model-instructions (agents/implementer.md + documenter.md)
  └── fix-audit-performance-skill        (skills/audit-performance/SKILL.md)
```

## Open questions

None. All architectural choices are decided: debugger is fast-tier (matches debugger.md); documenter is fast-tier (matches documenter.md); the gold-standard pattern is `plan/SKILL.md` (Architecture table with Model column + inline parenthetical at dispatch site).

<original_prompt>
/plan based on @reports/model-selection-enforcement-review-2026-03-02.md
</original_prompt>
