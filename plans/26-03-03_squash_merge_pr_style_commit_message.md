---
name: Squash-merge PR-style commit message
overview: When squash-merging a plan worktree into main, leave a PR-style commit message (what changed, why, key insights, deliverables) as a breadcrumb in git history. Implements for the git fallback path; documents Worktrunk limitation.
fileTree: |
  src/
  ├── cli/
  │   ├── index.ts              (modify - register plan summary command)
  │   └── plan-summary.ts       (create - tg plan summary --plan <id> [--format commit])
  docs/
  ├── multi-agent.md            (modify - plan-merge message format and Worktrunk caveat)
  └── plan-import.md            (optional - link to message format)
  .cursor/
  ├── skills/
  │   └── work/
  │       └── SKILL.md          (modify - compose message before plan-merge; use for git fallback)
  └── rules/
      ├── taskgraph-workflow.mdc (modify - plan completion step with message)
      └── subagent-dispatch.mdc  (modify - plan-merge message step if referenced)
  __tests__/
  └── integration/
      └── plan-summary.test.ts  (create - plan summary output format)
risks:
  - description: Worktrunk wt merge has no message flag; rich message only applies to git fallback
    severity: low
    mitigation: Document clearly; optionally document post-merge amend for Worktrunk users; implement git fallback first
  - description: Composing message before merge adds a step; orchestrator could fail after compose but before merge
    severity: low
    mitigation: Message is ephemeral (temp file or stdin); no persistent state; retry is safe
  - description: Event queries for evidence/notes may add DB load at plan completion
    severity: low
    mitigation: Single plan-scoped query; keep message generation fast
tests:
  - "tg plan summary --plan <id> outputs sections: what changed, why, deliverables; optional insights"
  - "tg plan summary --plan <id> --format commit produces a valid commit message body (subject + body)"
  - "Git fallback plan-merge uses composed message when available (manual or scripted check)"
todos:
  - id: define-message-format
    content: "Define and document PR-style squash commit message format and data source"
    agent: documenter
    changeType: create
    intent: |
      Define the format for the plan-merge squash commit message (breadcrumb). Sections:
      1. **Subject line**: Short summary (e.g. "plan: <Plan Name> — N tasks").
      2. **What changed**: Plan title + bullet list of task titles (from task table, done tasks only).
      3. **Why**: Plan overview / intent (from project.intent or plan metadata).
      4. **Key insights/learnings** (optional): From task notes (event kind=note) or /evolve report if run before merge; leave empty if none.
      5. **Deliverables**: Same as what changed, or one-line evidence per task (from done event body.evidence) when available.

      Document where each field comes from: plan_id, project.title, project.intent, task.content, task.status, event (done.body.evidence, note.body.message). Add a subsection to docs/multi-agent.md (or docs/agent-contract.md) under plan completion describing this format and that it serves as a breadcrumb for future readers of git history. No code changes.
    docs:
      - multi-agent
      - plan-import

  - id: document-worktrunk-caveat
    content: "Document plan-merge flow and Worktrunk vs git fallback message behavior"
    agent: documenter
    changeType: modify
    intent: |
      In docs/multi-agent.md (or agent-contract), document:
      - Current plan-merge step: optional /evolve, then wt merge main -C <plan-worktree-path> (Worktrunk) or git checkout main && git merge --squash <plan-branch> && git commit (git fallback).
      - Worktrunk: wt merge has no -m/--message flag; the squash commit uses the tool's default message unless the user configures Worktrunk's LLM message feature or runs a post-merge amend.
      - Git fallback: we can pass a custom message via git commit -m "<subject>" -m "<body>" or git commit -F <file>; the work skill will be updated to compose a PR-style message and use it here.
      No code changes; documentation only.
    docs:
      - multi-agent
      - agent-contract

  - id: cli-plan-summary
    content: "Add tg plan summary --plan <id> [--format commit] to generate PR-style message body"
    agent: implementer
    blockedBy: [define-message-format]
    changeType: create
    intent: |
      Create src/cli/plan-summary.ts with a Commander command `tg plan summary --plan <planId> [--format commit]`.

      Behavior:
      1. Resolve planId to project (plan) row; load project.title, project.intent. Load all tasks for this plan with status = 'done'; get task.content (title), optional hash_id. Optionally query event table for kind='done' (body.evidence) and kind='note' (body.message) for this plan's tasks to populate insights/deliverables.
      2. Build the message per the format defined in define-message-format: subject line, What changed (plan title + task list), Why (overview), Key insights (notes or empty), Deliverables (task titles or evidence one-liners).
      3. Default output: print the full message to stdout (human-readable). With --format commit: print subject on first line, blank line, then body (so it can be used with git commit -F or -m -m).
      4. Register in src/cli/index.ts (addCommand(planSummaryCommand)).
      5. Use existing DB layer (project, task, event queries). Follow code guidelines (Result types, no throw). If plan not found or no done tasks, output a minimal message (e.g. "plan: <title> — 0 tasks") so the merge step never blocks.
    docs:
      - schema
      - cli-reference

  - id: wire-git-fallback-message
    content: "Wire work skill and rules to compose PR-style message and use it for git fallback plan-merge"
    agent: implementer
    blockedBy: [cli-plan-summary]
    changeType: modify
    intent: |
      Update the plan-merge step so the git fallback uses a rich commit message.

      1. Work skill (.cursor/skills/work/SKILL.md): In "Plan-merge step", add a substep before running the merge: "Compose message: run `tg plan summary --plan <planId> --format commit` and capture stdout (or write to a temp file)." For the fallback, replace `git commit -m "plan: <plan-name>"` with: run `git checkout main && git merge --squash <plan-branch>`, then `git commit -F <tempfile>` (or equivalent with -m subject -m body). For the Worktrunk path, keep current `wt merge main -C <plan-worktree-path> --no-verify -y`; add one line: "Custom message not supported by wt merge; for a PR-style message use git fallback or amend after merge."
      2. AGENT.md: In plan completion step 1, add that when using git fallback the orchestrator should run `tg plan summary --plan <planId> --format commit` and use the output as the commit message.
      3. taskgraph-workflow.mdc and subagent-dispatch.mdc: If they describe the plan-merge step, add the same guidance (compose message, use for git commit).
      Do not change mergeWorktreeBranchIntoMain (that is for task->plan merge). Plan->main is orchestrated only via shell in the skill/rules.
    docs:
      - multi-agent
      - agent-contract

  - id: plan-summary-tests-and-cli-docs
    content: "Add integration test for tg plan summary and update cli-reference"
    agent: implementer
    blockedBy: [cli-plan-summary]
    changeType: create
    intent: |
      Add __tests__/integration/plan-summary.test.ts (or equivalent): with a seeded plan that has title, intent, and at least one done task (and optionally a note event), run tg plan summary --plan <id> and assert output contains the expected sections (subject, what changed, why, deliverables). Run with --format commit and assert first line is subject, then blank, then body.
      Update docs/cli-reference.md with the new command: tg plan summary --plan <planId> [--format commit], description and output format.
    docs:
      - cli-reference
      - testing

isProject: false
---

## Analysis

Squash-merging the plan branch into main currently produces a minimal commit message (`plan: <plan-name>` in the git fallback; Worktrunk's default in the wt path). The user wants a **PR-style summary** as a breadcrumb: what changed, why, key insights/learnings, and deliverables. This improves git history for future readers and aligns with the existing "Final action" pattern in the work skill (heredoc with task list for the dolt commit).

**Constraints:** Worktrunk's `wt merge` does not accept a custom message flag. So we implement the rich message for the **git fallback** only; we document the Worktrunk limitation and optionally mention post-merge amend or LLM config for users who need a custom message there.

**Data source:** At plan completion we have plan title, intent (overview), done tasks (titles), and optionally done-event evidence and note events. Export markdown is generated *after* plan-merge in the current flow, so the commit message must be built from DB/CLI (e.g. a new `tg plan summary` command) before the merge.

**Design:** Add `tg plan summary --plan <id> [--format commit]` that queries the task graph and outputs the PR-style message. The work skill (and AGENT/workflow rules) are updated to run this before plan-merge and use the output for the git fallback `git commit` step. Worktrunk path unchanged except documentation.

## Dependency graph

```text
Parallel start (2 unblocked):
  ├── define-message-format
  └── document-worktrunk-caveat

After define-message-format:
  ├── cli-plan-summary
  └── (plan-summary-tests depends on CLI existing)

After cli-plan-summary:
  ├── wire-git-fallback-message
  └── plan-summary-tests-and-cli-docs

After wire-git-fallback-message:
  └── (plan complete; optional run-full-suite can be added as final task)
```

## Proposed changes

- **Message format:** Subject line (plan: <Name> — N tasks), then body sections: What changed, Why, Key insights (optional), Deliverables. Data from project + task + event tables.
- **CLI:** `tg plan summary --plan <planId>` prints the message; `--format commit` prints subject, blank line, body for use with `git commit -F` or `-m -m`.
- **Work skill:** Before plan-merge, run `tg plan summary --plan <planId> --format commit`; for git fallback, use that output as the commit message. Worktrunk step unchanged; document that custom message is not supported there.
- **Docs:** multi-agent.md (or agent-contract) gets the format spec and the Worktrunk vs git fallback behavior.

## Open questions

- Whether to include note events in "Key insights" by default (could be noisy); may start with empty and add in a follow-up if needed.
- Whether to add an optional `--evolve-report <path>` to inject evolve output into the insights section when the user ran /evolve before merge (out of scope for first version; can add later).

<original_prompt>
when you squash and merge a worktree you should leave a good commit message a bit like a pr request summarising what has changed and why. Key insights/learnings and deliverables. this is another form of breadcrumb. /plan
</original_prompt>
