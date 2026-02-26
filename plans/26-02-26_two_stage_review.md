---
name: Two-Stage Review
overview: Split the reviewer sub-agent into spec-compliance and code-quality stages for clearer failure signals.
fileTree: |
  .cursor/agents/reviewer.md           (modify)
  .cursor/agents/spec-reviewer.md      (create)
  .cursor/agents/quality-reviewer.md   (create)
  .cursor/agents/README.md             (modify)
  .cursor/rules/subagent-dispatch.mdc  (modify)
  docs/skills/subagent-dispatch.md     (modify)
  src/template/.cursor/agents/reviewer.md          (modify)
  src/template/.cursor/agents/spec-reviewer.md     (create)
  src/template/.cursor/agents/quality-reviewer.md  (create)
  src/template/.cursor/rules/subagent-dispatch.mdc (modify)
risks:
  - description: Two review stages doubles review token cost
    severity: medium
    mitigation: Stage 2 only runs if Stage 1 passes; net cost increase is ~50% not 100%
  - description: Additional latency from sequential review
    severity: low
    mitigation: Each stage is fast-model; total added time is small vs implementer runtime
  - description: Template changes must propagate to src/template/ for consuming repos
    severity: low
    mitigation: Update both locations in the same plan
tests:
  - "Orchestrator dispatches spec-reviewer after implementer completes"
  - "Spec-reviewer FAIL skips quality review and triggers re-dispatch"
  - "Spec-reviewer PASS triggers quality-reviewer dispatch"
  - "Quality-reviewer FAIL triggers re-dispatch with quality feedback"
  - "Both PASS marks task as reviewed"
todos:
  - id: spec-reviewer-agent
    content: "Create spec-reviewer agent template for spec-compliance checking"
    intent: |
      Create .cursor/agents/spec-reviewer.md focused solely on: did the implementer
      do what the task asked? Input: task intent, acceptance criteria, suggested_changes,
      and the diff. Output: PASS/FAIL. FAIL lists specific unmet requirements.
      Does NOT check code quality, style, or patterns - only spec compliance.
    changeType: create
    skill: [subagent-dispatch]
  - id: quality-reviewer-agent
    content: "Create quality-reviewer agent template for code quality checking"
    intent: |
      Create .cursor/agents/quality-reviewer.md focused solely on code quality:
      error handling, unused imports, test coverage, style consistency, patterns.
      Input: diff and file context. Output: PASS/FAIL with specific issues.
      Does NOT re-check spec compliance - only quality.
    changeType: create
    skill: [subagent-dispatch]
  - id: update-dispatch-rule
    content: "Update subagent-dispatch.mdc with two-stage review flow"
    intent: |
      Modify .cursor/rules/subagent-dispatch.mdc Pattern 1 and Pattern 2 step 6
      (the review step) to: (1) dispatch spec-reviewer first, (2) if PASS dispatch
      quality-reviewer, (3) if either FAILs, re-dispatch implementer with the
      specific feedback. Update the retry logic accordingly.
    suggestedChanges: |
      In Pattern 1 step 6, replace single reviewer dispatch with:
      6a. Dispatch spec-reviewer with task context + diff
      6b. If spec-reviewer PASS → dispatch quality-reviewer with diff
      6c. If either FAIL → re-dispatch implementer with feedback
    blockedBy: [spec-reviewer-agent, quality-reviewer-agent]
    changeType: modify
    skill: [rule-authoring]
  - id: update-agents-readme
    content: "Update .cursor/agents/README.md with new reviewer agents"
    intent: |
      Add spec-reviewer and quality-reviewer to the directory layout section.
      Explain the two-stage flow. Note that the old reviewer.md is kept for
      reference but the dispatch rule now uses the split agents.
    changeType: modify
    skill: [documentation-sync]
  - id: update-templates
    content: "Copy new agents and updated dispatch rule to src/template/"
    intent: |
      Copy spec-reviewer.md and quality-reviewer.md to src/template/.cursor/agents/.
      Update src/template/.cursor/rules/subagent-dispatch.mdc with the same two-stage
      flow changes. These templates are what consuming repos get via tg setup.
    blockedBy: [update-dispatch-rule]
    changeType: modify
  - id: update-skill-docs
    content: "Update docs/skills/subagent-dispatch.md with two-stage review"
    intent: |
      Document the two-stage review pattern in the skill guide. Explain when
      spec-compliance vs code-quality feedback is more useful for re-dispatch.
    changeType: document
    skill: [documentation-sync]
isProject: false
---

## Analysis

The current reviewer agent checks both spec compliance and code quality in one pass. This conflates
two distinct failure modes:

- "You didn't do what the task asked" (spec failure) → implementer needs to re-read intent
- "Your code has quality issues" (quality failure) → implementer needs targeted fixes

Superpowers splits these into two stages. The spec check runs first because there's no point
reviewing code quality if the implementation is off-spec. This gives the orchestrator clearer
re-dispatch feedback.

## Proposed flow

```mermaid
graph TD
  I[Implementer completes] --> S[Spec Reviewer]
  S -->|PASS| Q[Quality Reviewer]
  S -->|FAIL| R1[Re-dispatch implementer with spec feedback]
  Q -->|PASS| D[Task reviewed ✓]
  Q -->|FAIL| R2[Re-dispatch implementer with quality feedback]
  R1 --> I
  R2 --> I
```

## Token cost analysis

Current: 1 reviewer call per task (always).
Proposed: 1 spec call (always) + 1 quality call (only on spec pass). Assuming ~80% spec pass rate,
average is 1.8 calls instead of 1. But each call is cheaper (narrower scope, shorter prompt).
Net increase is modest.

<original_prompt>
Split the reviewer sub-agent into spec-compliance and code-quality stages,
inspired by Superpowers' two-stage review pattern.
</original_prompt>
