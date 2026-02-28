---
name: Implementer No Tests, Plan-End Add Tests and Gate
overview: Implementers stop running tests; plans end with dedicated add-tests and run-full-suite tasks; lead is informed on full-suite failure and decides follow-up.
fileTree: |
  .cursor/
  ├── agents/
  │   └── implementer.md               (modify)
  ├── rules/
  │   ├── plan-authoring.mdc           (modify)
  │   ├── subagent-dispatch.mdc        (modify)
  │   └── taskgraph-workflow.mdc       (modify)
  └── skills/
      ├── plan/
      │   └── SKILL.md                 (modify)
      └── work/
          └── SKILL.md                 (modify)
  src/template/.cursor/agents/
  └── implementer.md                   (modify)
  docs/
  └── plan-format.md                  (modify)
  AGENT.md                             (modify)
risks:
  - description: Consuming repos using the template may rely on implementers running tests
    severity: medium
    mitigation: Document in template and release notes; implementer template explicitly says do not run tests.
  - description: Per-batch gate in work skill could be misinterpreted as replacing full-suite task
    severity: low
    mitigation: Clarify in work skill that per-batch gate is optional/lightweight; full suite is the final plan task.
tests:
  - "Plan authoring rule enforces final add-tests and run-full-suite structure"
  - "Implementer template (root and template) no longer instructs run tests; evidence wording updated"
todos:
  - id: implementer-no-tests
    content: "Update implementer template to remove run tests; evidence = commands/git ref only"
    agent: implementer
    intent: |
      In .cursor/agents/implementer.md and src/template/.cursor/agents/implementer.md:
      - Step 3: Remove "Run tests if applicable (e.g. pnpm test...)". Replace with implement-only; optionally lint/typecheck if in scope. State explicitly that implementers do not run tests; tests are added and run in dedicated plan-end tasks.
      - Step 4 (evidence): Change from "tests run, commands, or git ref" to "commands run, git ref, or implemented; no test run". Output contract: same — evidence string, no schema change.
      Do not add or change other steps. Keep Purpose and Learnings unchanged for this task.
    changeType: modify
  - id: plan-authoring-final-tasks
    content: "Require plans to end with add-tests task(s) and run-full-suite task"
    agent: implementer
    intent: |
      In .cursor/rules/plan-authoring.mdc (and docs/plan-format.md if needed): Add a required convention that every plan must end with (a) one or more tasks that create tests for the new features (or assign plan-level tests to such tasks), and (b) a final task that runs the full test suite (e.g. pnpm gate:full or bash scripts/cheap-gate.sh --full). Document: the run-full-suite task records result in evidence; on failure the agent adds tg note with failure reason and either does not mark done or marks done with failure in evidence so the lead can create fix tasks. Dependency graph: these final tasks are blocked by all feature work. Reference the dependency graph format already in the rule. No change to import logic; this is authoring guidance only.
    changeType: modify
  - id: lead-informed-on-failure
    content: "Document how lead is informed when full-suite fails; update Follow-up from notes"
    agent: implementer
    intent: |
      Decide and document the protocol for when the "run full test suite" task fails. Use existing mechanisms only (no new event kind). Option A: agent leaves task not-done and adds tg note with failure reason; lead sees it in tg status / tg show and creates fix tasks. Option B: agent marks task done with evidence "gate:full failed: ..." and adds a note; lead uses Follow-up from notes/evidence to create follow-up tasks. Document the chosen protocol in .cursor/rules/subagent-dispatch.mdc under "Follow-up from notes/evidence" (add a bullet or short subsection for full-suite failure). Optionally one sentence in docs/schema.md for done body (evidence can describe gate result). Ensure work skill references this so the orchestrator knows to check notes/evidence after the final task.
    changeType: document
  - id: workflow-agent-evidence
    content: "Update taskgraph-workflow and AGENT.md evidence wording for implementer vs gate task"
    agent: implementer
    blockedBy: [implementer-no-tests, lead-informed-on-failure]
    intent: |
      In .cursor/rules/taskgraph-workflow.mdc and AGENT.md: Update evidence wording so that implementers are not expected to report "tests run". Use "commands run, git ref" or "implemented; no test run" for implementer evidence. For the final run-full-suite task, evidence is "gate:full passed" or "gate:full failed: <summary>". Recovery and direct execution: evidence can remain "completed previously" or "gate:full run by human". Do not change CLI behavior; only documentation and rule text.
    changeType: modify
  - id: work-skill-subagent-dispatch
    content: "Clarify work skill and subagent-dispatch: per-batch gate vs final full-suite task"
    agent: implementer
    blockedBy: [plan-authoring-final-tasks, lead-informed-on-failure]
    intent: |
      In .cursor/skills/work/SKILL.md: Clarify that per-batch cheap-gate (after each batch) is optional or lightweight; the full test suite is run only as the dedicated final plan task (run-full-suite task), not by the orchestrator after every batch. When the final run-full-suite task fails, follow "Follow-up from notes/evidence" (create fix tasks or escalate). In .cursor/rules/subagent-dispatch.mdc: Under test coverage / execution, state that the last tasks of every plan must be add-tests then run-full-suite; implementers do not run tests. Ensure both docs reference the lead-informed protocol from lead-informed-on-failure.
    changeType: modify
  - id: implementer-learnings
    content: "Add implementer learning: do not run tests; tests are plan-end tasks"
    agent: implementer
    blockedBy: [implementer-no-tests]
    intent: |
      In .cursor/agents/implementer.md (and src/template/.cursor/agents/implementer.md if that file has a Learnings section): Add a learning entry that implementers do not run tests; tests are added and run in dedicated plan-end tasks (add-tests task(s) and run-full-suite task). One or two sentences. Place in the ## Learnings section.
    changeType: modify
isProject: false
---

## Analysis

Implementers today are instructed to "Run tests if applicable" and to put "tests run" in evidence. The user wants a clear separation: implementers implement only; the last tasks of every plan are (a) creating tests for the new features, (b) running the full test suite. If the full suite fails, the lead (orchestrator) is informed and decides what to do (follow-up fix tasks or escalate).

Existing patterns: Cheap Gate Typecheck Hygiene already has a final task "Run gate and gate:full; confirm both pass". The work skill runs cheap-gate after each batch. Follow-up from notes/evidence already handles gate failures by creating follow-up tasks. No schema change is required; evidence and notes suffice to inform the lead.

Decisions: (1) Implementer template drops "run tests" and narrows evidence to commands/git ref. (2) Plan authoring requires final add-tests + run-full-suite tasks. (3) Lead informed via existing note + evidence; document in subagent-dispatch and work skill. (4) Per-batch gate stays optional; full suite is the final task only.

## Dependency graph

```
Parallel start (3 unblocked):
  ├── implementer-no-tests
  ├── plan-authoring-final-tasks
  └── lead-informed-on-failure

After implementer-no-tests:
  └── implementer-learnings

After implementer-no-tests and lead-informed-on-failure:
  └── workflow-agent-evidence

After plan-authoring-final-tasks and lead-informed-on-failure:
  └── work-skill-subagent-dispatch
```

## Proposed changes

- **Implementer template**: Step 3 remove "Run tests if applicable..."; add "Do not run tests; tests are added and run in dedicated plan-end tasks." Step 4 evidence: "commands run, git ref, or implemented; no test run."
- **Plan authoring**: New subsection or bullet "Plan-end structure" requiring (a) add-tests task(s), (b) run-full-suite task, blocked by all feature work; run-full-suite records result in evidence and on failure uses tg note so lead can follow up.
- **Lead informed**: Document in subagent-dispatch "Follow-up from notes/evidence" that when the run-full-suite task fails, the agent adds a note (and optionally leaves task not-done or marks done with failure in evidence); the lead creates fix tasks or escalates.
- **Work skill**: State that full suite is the final plan task; per-batch gate is optional/lightweight.

## Open questions

None; protocol uses existing events and notes.

<original_prompt>
Implementer agents should not run tests. Instead, the last tasks of a plan should be: (1) creating tests for the new features, (2) running all tests to make sure we have not broken anything else. If we have broken something else then the lead gets informed and has to decide what to do.

/plan this
</original_prompt>
