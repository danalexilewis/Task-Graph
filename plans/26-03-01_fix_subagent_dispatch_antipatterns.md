---
name: Fix Sub-Agent Dispatch Anti-Patterns
overview: Remove the orchestrator pre-start worktree pattern and terminal polling anti-pattern from subagent-dispatch.mdc and all secondary docs/agent files that reinforce them.
fileTree: |
  .cursor/
  ├── rules/
  │   ├── subagent-dispatch.mdc       (modify - primary)
  │   └── taskgraph-workflow.mdc      (modify - secondary)
  └── agents/
      ├── implementer.md              (modify - secondary)
      └── README.md                   (modify - secondary)
  docs/
  ├── leads/
  │   └── execution.md                (modify - secondary)
  └── agent-field-guide.md            (modify - secondary)
risks:
  - description: Removing the pre-start path entirely could break flows that genuinely need plan_branch from the started event before dispatch
    severity: low
    mitigation: Keep pre-start as an explicit opt-in exception with a named reason; just stop making it the default
tests:
  - "All changed passages read as the preferred default being implementer self-start"
  - "No passage in any changed file instructs the orchestrator to run tg start before dispatch as the default"
todos:
  - id: fix-subagent-dispatch-mdc
    content: "Fix subagent-dispatch.mdc: make implementer self-start the default, add do-not-pre-start directive, add Task-tool auto-await note"
    agent: documenter
    changeType: modify
    intent: |
      Four targeted edits to `.cursor/rules/subagent-dispatch.mdc`:

      **Edit 1 — Worktrunk orchestrator bullet (around line 45):**
      Rewrite the Orchestrator bullet so the default is to omit WORKTREE_PATH and let the implementer self-start. Pre-start becomes an explicit opt-in for when the orchestrator needs the started event data before building prompts (e.g. capturing plan_branch). Example rewrite:
      > **Orchestrator**: The default is to omit `{{WORKTREE_PATH}}` and let each implementer run its own `tg start --worktree` in Step 1 (see implementer.md). Only pre-start worktrees yourself when you need the started-event data before building prompts — e.g. to capture `plan_branch` for passing to subsequent implementers. When you do pre-start: run `tg start <taskId> --agent <name> --worktree` from repo root, capture the path from `tg worktree list --json`, then inject as `{{WORKTREE_PATH}}`.

      **Edit 2 — Pattern 1 Step 4 (the long paragraph, around line 123):**
      Add an explicit callout at the start of the WORKTREE_PATH instruction: "**Do not pre-start worktrees as separate shell calls before dispatch** — the default is to omit `{{WORKTREE_PATH}}` and let each implementer self-start in Step 1. Only pre-start when you need the started-event data (e.g. plan_branch) before building prompts."
      Also reframe "Pass WORKTREE_PATH explicitly when you have it" → make it clearly optional rather than the expected path.

      **Edit 3 — Pattern 1 Step 5 (dispatch step, around line 124):**
      Add a note after the dispatch instruction: "**Task tool calls are synchronous** — they block until the sub-agent returns and deliver results directly. Do not use `sleep && cat` or terminal-file polling to monitor sub-agents. Terminal-file polling applies only to backgrounded shell commands (`block_until_ms: 0`); it is not needed for Task tool dispatches."

      **Edit 4 — "Building prompts from context JSON" section (around line 221):**
      The passage "For implementer when using worktrees (Pattern 1): also pass WORKTREE_PATH — run `tg start <taskId> --agent <name> --worktree` from repo root, then `tg worktree list --json`…" currently instructs the orchestrator to pre-start. Rewrite to: "For implementer when using worktrees: `{{WORKTREE_PATH}}` is optional. If omitted, the implementer self-starts in Step 1. Pass it only when you have pre-started for a specific reason (e.g. capturing plan_branch from the started event)."

      Keep the Implementer bullet (line 46) and Step 1 in implementer.md unchanged — they already correctly document the two-path logic.

  - id: fix-workflow-polling-note
    content: "Fix taskgraph-workflow.mdc: clarify terminal polling applies to shell commands only, not Task tool sub-agents"
    agent: documenter
    changeType: modify
    intent: |
      In `.cursor/rules/taskgraph-workflow.mdc`, find the section that describes monitoring backgrounded commands (the `sleep && cat terminals/` polling pattern). Add a clarifying parenthetical or sentence:

      > (This is for backgrounded **shell commands** only — e.g. `gate:full` or long CLI commands sent with `block_until_ms: 0`. Task tool sub-agent calls are synchronous: they block until the sub-agent returns and deliver results directly to the orchestrator. Never poll terminal files to monitor Task tool sub-agents.)

      The existing shell-command polling documentation is correct; this is purely an additive clarification, not a removal.

  - id: fix-agents-readme-prestart
    content: "Fix .cursor/agents/README.md: update 'How dispatch works' step 5 to reflect implementer self-start as default"
    agent: documenter
    changeType: modify
    intent: |
      In `.cursor/agents/README.md`, find the "How dispatch works" section and step 5 (which currently says "orchestrator runs `tg start <taskId> --agent <name> --worktree` and passes `{{WORKTREE_PATH}}`"). Update it to reflect that the default is implementer self-start:

      > 5. **Worktrees**: The implementer self-starts by default — run `tg start <taskId> --agent <name> --worktree` from Step 1 and `cd` to the path from `tg worktree list --json`. The orchestrator may pre-start and pass `{{WORKTREE_PATH}}` explicitly when it needs the started-event data before building prompts.

      Read the full file first to confirm the exact location and wording of step 5.

  - id: fix-execution-lead-prestart
    content: "Fix docs/leads/execution.md: update Pattern step 2 to reflect implementer self-start as default"
    agent: documenter
    changeType: modify
    intent: |
      In `docs/leads/execution.md`, find the Pattern section where it says something like "Step 2: Run `tg start <taskId> --agent <name> --worktree`; pass the worktree path (from `tg worktree list --json`) to each implementer as WORKTREE_PATH."

      Update it to reflect:
      - Default: omit WORKTREE_PATH; let the implementer self-start in Step 1
      - Pre-start only when the orchestrator needs the started-event data before building prompts (e.g. plan_branch)

      Read the full file first to find the exact location and surrounding context before editing.

  - id: fix-field-guide-worktree-example
    content: "Fix docs/agent-field-guide.md: update Worktree Workflow example to show implementer self-start as primary path"
    agent: documenter
    changeType: modify
    intent: |
      In `docs/agent-field-guide.md`, find the Worktree Workflow section (around line 496–497, comment "Step 1: Start (orchestrator passes WORKTREE_PATH)"). Update the example or annotation to show the self-start path as primary:

      - Either: rewrite the example to show "WORKTREE_PATH omitted; implementer runs tg start itself"
      - Or: annotate the existing example as "only when orchestrator pre-starts for a specific reason (e.g. capturing plan_branch)"

      Do not change the surrounding worktree lifecycle documentation. Only update the example or comment that implies the orchestrator must pass WORKTREE_PATH.

      Read the full Worktree Workflow section first to understand its scope before editing.

  - id: fix-implementer-input-contract
    content: "Fix implementer.md: update WORKTREE_PATH Input Contract description to make it optional"
    agent: documenter
    changeType: modify
    intent: |
      In `.cursor/agents/implementer.md`, find the Input Contract section (line ~19) which says "the orchestrator runs `tg start ... --worktree` and passes this path." Update it to make WORKTREE_PATH explicitly optional:

      > `{{WORKTREE_PATH}}` — (optional) absolute path to the task's worktree. When passed, the task is already started; `cd` to this path in Step 1. When omitted, run `pnpm tg start {{TASK_ID}} --agent {{AGENT_NAME}} --worktree` yourself in Step 1 and obtain the path from `tg worktree list --json`.

      This aligns the Input Contract description with the already-correct Step 1 template (lines 65–67), which already handles both paths. Do not change Step 1 or any other part of the file.
isProject: false
---

## Analysis

The investigation found that orchestrators consistently fall into two anti-patterns:

1. **Sequential pre-start**: Running `tg start <taskId> --worktree` via 3+ separate shell tool calls (one per task) before dispatching implementers. This is slow and serial. The implementer's Step 1 already handles self-start when `{{WORKTREE_PATH}}` is omitted — the fix is to not pass it by default.

2. **Terminal polling after dispatch**: Running `sleep N && cat terminals/<id>.txt | tail -30` to monitor sub-agent progress. Task tool calls are synchronous and auto-await. The confusion comes from terminal-file monitoring being documented for shell commands and applied by analogy to Task tool sub-agents.

The analyst found **four independent sources** in `subagent-dispatch.mdc` that instruct or imply the orchestrator should pre-start:

- The Worktrunk Orchestrator bullet (lines 45)
- Pattern 1 Step 4's "from a prior `tg start`" guidance
- The Lifecycle and errors section's split-personality sentence
- The "Building prompts" section's direct instruction

Plus secondary reinforcement in `agents/README.md`, `docs/leads/execution.md`, `docs/agent-field-guide.md`, and `implementer.md`'s Input Contract.

**The fix**: Make implementer self-start the explicit default everywhere. Keep pre-start as a named opt-in for the specific case where the orchestrator needs `plan_branch` from the started event before building prompts. Add a clear Task-tool auto-await note next to the dispatch step.

## Dependency graph

```
Parallel start (all 6 independent — different files):
  ├── fix-subagent-dispatch-mdc       (primary: 4 edits to subagent-dispatch.mdc)
  ├── fix-workflow-polling-note        (taskgraph-workflow.mdc: add clarification)
  ├── fix-agents-readme-prestart       (agents/README.md: step 5 update)
  ├── fix-execution-lead-prestart      (docs/leads/execution.md: step 2 update)
  ├── fix-field-guide-worktree-example (docs/agent-field-guide.md: example update)
  └── fix-implementer-input-contract   (implementer.md: Input Contract wording)
```

All tasks touch different files with no overlap. Full parallel execution is safe.

## Original prompt

<original_prompt>
/investigate why is this happening in my agents now (screenshot showing 3 sequential tg start --worktree shell calls and then sleep 15 && cat terminals/... | tail -30)

also why not batch start all the tasks in one request?

/plan based on the above
</original_prompt>
