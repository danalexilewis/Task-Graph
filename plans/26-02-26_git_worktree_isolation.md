---
name: Git Worktree Isolation
overview: Integrate git worktrees so parallel implementers work in isolated branches, eliminating file conflicts.
fileTree: |
  src/cli/worktree.ts           (create)
  src/cli/start.ts              (modify)
  src/cli/done.ts               (modify)
  src/cli/index.ts              (modify)
  .cursor/rules/subagent-dispatch.mdc (modify)
  docs/cli-reference.md         (modify)
  __tests__/integration/worktree.test.ts (create)
risks:
  - description: Git worktree management adds system-level complexity
    severity: high
    mitigation: Make worktrees opt-in via config flag; fall back to current behavior by default
  - description: Merge conflicts when worktrees are merged back
    severity: medium
    mitigation: Each worktree works on a branch; merge is explicit via PR or manual merge
  - description: Disk space for multiple worktrees
    severity: low
    mitigation: Worktrees share the git object store; only working files are duplicated
tests:
  - "tg start --worktree creates a git worktree and branch for the task"
  - "tg done --worktree merges the branch and cleans up the worktree"
  - "Parallel tasks get separate worktrees with no file conflicts"
  - "Without --worktree flag, behavior is unchanged"
todos:
  - id: worktree-module
    content: "Create git worktree management module in src/cli/worktree.ts"
    intent: |
      Functions to create, list, and remove git worktrees using execa + git CLI.
      createWorktree(taskId: string, baseBranch?: string): creates branch tg/<taskId>
      and worktree at .taskgraph/worktrees/<taskId>/.
      removeWorktree(taskId: string): removes worktree and optionally deletes branch.
      listWorktrees(): returns active worktrees.
    changeType: create
    domain: [cli]
  - id: start-worktree
    content: "Add --worktree flag to tg start command"
    intent: |
      When tg start <taskId> --worktree is used, create a git worktree for the task
      before starting work. Log the worktree path in the started event body
      so the orchestrator can tell the implementer where to work.
    suggestedChanges: |
      In start.ts, after creating the started event:
      if (options.worktree) {
        const wt = await createWorktree(taskId);
        // Add worktree_path to event body
      }
    blockedBy: [worktree-module]
    changeType: modify
    domain: [cli]
    skill: [cli-command-implementation]
  - id: done-worktree
    content: "Add worktree cleanup to tg done command"
    intent: |
      When completing a task that has a worktree, offer to merge the branch
      back to the base branch and clean up the worktree directory.
      Add --merge flag to tg done for explicit merge.
    blockedBy: [worktree-module]
    changeType: modify
    domain: [cli]
    skill: [cli-command-implementation]
  - id: wt-update-dispatch
    content: "Update dispatch rule to use worktrees for parallel tasks"
    intent: |
      In subagent-dispatch.mdc Pattern 1 (parallel batch), when dispatching
      multiple implementers, use --worktree for each. Pass the worktree path
      to the implementer so it cds into the right directory.
    blockedBy: [start-worktree]
    changeType: modify
    skill: [rule-authoring]
  - id: wt-integration-tests
    content: "Integration tests for worktree creation and cleanup"
    intent: |
      Test in a temporary git repo: create worktree, verify branch exists,
      verify worktree directory, clean up, verify removal.
    blockedBy: [start-worktree, done-worktree]
    changeType: test
    skill: [integration-testing]
  - id: wt-update-docs
    content: "Document git worktree integration in cli-reference.md"
    intent: |
      Document the --worktree flag on tg start and tg done.
      Explain when to use worktrees (parallel tasks) vs default (sequential).
    changeType: document
    skill: [documentation-sync]
isProject: false
---

## Analysis

Currently, parallel implementers share the working directory. The dispatch rule warns about file
conflicts and falls back to sequential execution when tasks might touch the same files. Superpowers
and Gastown both use git worktrees to give each agent an isolated workspace.

Git worktrees are lightweight - they share the same `.git` object store but have separate working
directories and branches. This eliminates file conflicts entirely for parallel work.

## Proposed flow

```mermaid
sequenceDiagram
  Orchestrator->>tg start: --worktree taskId
  tg start->>git: worktree add .taskgraph/worktrees/<id> -b tg/<id>
  tg start->>Orchestrator: worktree_path in event body
  Orchestrator->>Implementer: "Work in .taskgraph/worktrees/<id>/"
  Implementer->>tg done: taskId --merge
  tg done->>git: merge tg/<id> into main
  tg done->>git: worktree remove
```

## Configuration

Opt-in via `.taskgraph/config.json`:

```json
{ "useWorktrees": true }
```

When enabled, `tg start` auto-creates worktrees. When disabled (default), behavior is unchanged.

<original_prompt>
Integrate git worktrees so parallel implementers work in isolated branches,
inspired by Superpowers and Gastown's worktree isolation patterns.
</original_prompt>
