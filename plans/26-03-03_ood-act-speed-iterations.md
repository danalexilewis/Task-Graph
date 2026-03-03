---
name: OOD/Act Sub-Agent Behaviour - Speed and Iterations
overview: Shift sub-agent behaviour so the orchestrator/lead does OOD (Observe, Orient, Decide) and the sub-agent does only Act (clear action on a given file path). Design for speed and fast iterations to fix — not for preventing sub-agent mistakes.
fileTree: |
  .cursor/
  ├── agents/
  │   └── implementer.md          (modify — add ACTION_DIRECTIVE, TARGET_PATHS, Act-only framing)
  ├── rules/
  │   └── subagent-dispatch.mdc   (modify — Decide step, placeholder list)
  └── skills/
      └── work/
          └── SKILL.md            (modify — derive action+path from context)
  docs/
  ├── leads/
  │   └── execution.md            (modify — Decide step in loop)
  └── agent-contract.md           (optional — context JSON doc reference)
risks:
  - description: Orchestrator produces wrong action or path; sub-agent executes it correctly but work is wrong.
    severity: medium
    mitigation: Accept; rely on fast re-dispatch and tg note. Optional checklist for Decide step; fallback to full context for ambiguous tasks.
  - description: Over-constraint on exploratory tasks.
    severity: low
    mitigation: When ACTION_DIRECTIVE is absent, implementer uses full intent/suggested_changes (existing behaviour).
tests:
  - "Optional: contract test that context JSON shape matches template placeholders (or integration test for dispatch with action+path)."
todos:
  - id: implementer-action-placeholders
    content: Add ACTION_DIRECTIVE and TARGET_PATHS to implementer template; reframe to Act-only when set
    agent: implementer
    intent: |
      Add new placeholders {{ACTION_DIRECTIVE}}, {{TARGET_PATHS}}, and optional {{PRECONDITIONS}} to .cursor/agents/implementer.md.
      When ACTION_DIRECTIVE is set: reframe "Step 2 — Load context" so the sub-agent is told "You have one action; perform it on the given path(s)."
      Add instruction: if the action is impossible (file missing, precondition false), report VERDICT: FAIL and SUGGESTED_FIX.
      Keep intent, suggested_changes, file_tree as read-only reference. De-emphasise "Assess before following" / open-ended "Decide" when ACTION_DIRECTIVE is present.
      When ACTION_DIRECTIVE is absent (empty or omitted), keep current behaviour (full intent + suggested changes + "Do the todos").
    suggestedChanges: |
      In the prompt template: after Task/Title/Intent block, add "**Action directive (perform this):** {{ACTION_DIRECTIVE}}" and "**Target path(s):** {{TARGET_PATHS}}" and optionally "**Preconditions (bail if false):** {{PRECONDITIONS}}".
      In Step 2, add conditional: "If ACTION_DIRECTIVE was provided above, perform only that action on the given path(s); do not re-observe or re-decide."
    changeType: modify
  - id: execution-lead-decide-step
    content: Execution lead and work skill — add Decide step (context → action + path)
    agent: implementer
    blockedBy: [implementer-action-placeholders]
    intent: |
      Update docs/leads/execution.md and .cursor/skills/work/SKILL.md so that after fetching tg context for a task, the orchestrator (or execution-lead instructions) produces a short action directive and 1–3 target paths from title, intent, suggested_changes, and file_tree.
      No new CLI or API — prompt-building only. Rules: in subagent-dispatch.mdc, add a step "After tg context <taskId> --json, derive ACTION_DIRECTIVE and TARGET_PATHS (e.g. from suggested_changes + file_tree + intent); inject into implementer prompt."
      Document that when the task is ambiguous or exploratory, the lead may omit ACTION_DIRECTIVE and pass full context (fallback to current behaviour).
    suggestedChanges: |
      execution.md: in the Loop / Pattern section, add "Decide: from context JSON, produce action directive (one sentence) and target path(s); inject as {{ACTION_DIRECTIVE}} and {{TARGET_PATHS}} into implementer prompt."
      work/SKILL.md: same step in the loop. subagent-dispatch.mdc: in "Building prompts from context JSON", add "When building implementer prompt, derive ACTION_DIRECTIVE and TARGET_PATHS from context (title, intent, suggested_changes, file_tree) and substitute; if task is exploratory, leave empty and use full intent."
    changeType: modify
  - id: document-context-json-shape
    content: Document actual tg context --json shape and fallback when ACTION_DIRECTIVE absent
    agent: documenter
    intent: |
      Add one doc (e.g. new section in docs/agent-contract.md or docs/agent-context.md) that lists every field in the context JSON (ContextResult / tg context --json) and how each maps to implementer template placeholders.
      Note that related_done_by_domain and related_done_by_skill are documented in subagent-dispatch but not yet populated by runContextChain; either add a "Not yet implemented" note or remove from docs until implemented.
      State explicitly: when ACTION_DIRECTIVE is absent in the prompt, the implementer uses full intent and suggested_changes (fallback for ambiguous/exploratory tasks).
    changeType: document
  - id: optional-related-done-context
    content: "(Optional) Add related_done_by_domain and related_done_by_skill to runContextChain and ContextOutput"
    agent: implementer
    intent: |
      Implement related_done_by_domain and related_done_by_skill in src/api/client.ts runContextChain (query by task_doc / task_skill for same-plan done tasks). Add to ContextOutput in domain/token-estimate.ts and to ContextResult in api/types.ts. Include in compaction if present.
      Aligns subagent-dispatch and cli-reference with implementation. Not required for OOD/Act v1; can be done in parallel or after other tasks.
    changeType: modify
  - id: optional-result-runcontextchain
    content: "(Optional) Refactor runContextChain to Result/ResultAsync; unwrap at CLI boundary"
    agent: implementer
    intent: |
      Replace internal throws in api/client.ts runContextChain with ResultAsync; propagate errors to TgClient.context() which already wraps in ResultAsync.fromPromise. Optionally make getHiveSnapshot in cli/context.ts Result-based. Reduces risk of unhandled rejections when adding related_done or other context changes.
      Hardening only; independent of action+path prompt changes.
    changeType: refactor
  - id: optional-reviewer-checklist-from-directive
    content: "(Optional) Spec-reviewer checklist derived from ACTION_DIRECTIVE when present"
    agent: implementer
    blockedBy: [implementer-action-placeholders, execution-lead-decide-step]
    intent: |
      When the orchestrator passes ACTION_DIRECTIVE to the implementer, optionally pass a short checklist to the spec-reviewer derived from that directive (e.g. "Verify that getRelatedDoneTasks exists and is called in runContextChain"). Lightweight; no new agent type. Implementer template and execution lead already have the directive; add one sentence in subagent-dispatch or spec-reviewer template: "When reviewing, use the same ACTION_DIRECTIVE as a checklist if provided."
    changeType: modify
isProject: false
---

# OOD/Act Sub-Agent Behaviour — Speed and Iterations

## Analysis

We shift responsibility so the **orchestrator/lead** does Observe, Orient, and Decide, and the **sub-agent** receives a clear **action + file path(s)** and only Acts. The user explicitly does not want to optimize for preventing sub-agent mistakes; we optimise for **speed** and **fast iterations to fix** (re-dispatch, fixer, tg note) when something goes wrong.

- **Minimal v1:** Add `ACTION_DIRECTIVE` and `TARGET_PATHS` to the implementer template and have the execution lead derive them from existing `tg context --json` (title, intent, suggested_changes, file_tree). No schema change, no change to runContextChain for v1.
- **Fallback:** When the task is ambiguous or exploratory, the lead omits the directive and the implementer keeps current behaviour (full intent + suggested changes).
- **Optional follow-ups:** Document context JSON shape; optionally add related_done to context and make runContextChain Result-based; optionally derive a reviewer checklist from the directive. These do not block v1.

## Dependency graph

```
Parallel start:
  ├── implementer-action-placeholders
  └── document-context-json-shape

After implementer-action-placeholders:
  └── execution-lead-decide-step

After execution-lead-decide-step:
  └── optional-reviewer-checklist-from-directive (optional)

Independent (optional, any order):
  ├── optional-related-done-context
  └── optional-result-runcontextchain
```

## Proposed changes

- **Implementer template:** New placeholders `{{ACTION_DIRECTIVE}}`, `{{TARGET_PATHS}}`, `{{PRECONDITIONS}}`. When set, "You have one action; perform it on the given path(s). If impossible, VERDICT: FAIL + SUGGESTED_FIX." When absent, existing "Load context / Do the todos" behaviour.
- **Execution lead / work skill:** After `tg context <taskId> --json`, add step "Decide: derive action directive (one sentence) and 1–3 target paths from title, intent, suggested_changes, file_tree; inject into implementer prompt." Document in execution.md, work/SKILL.md, subagent-dispatch.mdc.
- **Context doc:** One section or doc listing context JSON fields and placeholder mapping; note related_done not yet implemented; state fallback when ACTION_DIRECTIVE absent.

## Open questions

- None; optional tasks can be prioritised or skipped per capacity.

<original_prompt>
/plan im not worried about a sub agent doing something wrong. we will focus on iterations to fix things with speed
</original_prompt>
