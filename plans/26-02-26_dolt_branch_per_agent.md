---
name: Dolt Branch Per Agent
overview: Have implementer agents work on Dolt branches for safe rollback of task graph mutations.
fileTree: |
  src/db/branch.ts              (create)
  src/db/connection.ts          (modify)
  src/cli/start.ts              (modify)
  src/cli/done.ts               (modify)
  src/cli/utils.ts              (modify)
  .taskgraph/config.json        (modify)
  docs/architecture.md          (modify)
  __tests__/integration/dolt-branch.test.ts (create)
risks:
  - description: Dolt branch operations add latency to start/done commands
    severity: medium
    mitigation: Branch creation is fast in Dolt; merge is the expensive operation but only happens on done
  - description: Merge conflicts between agent branches and main
    severity: high
    mitigation: Task graph mutations are typically non-conflicting (different task rows); Dolt handles cell-level merge
  - description: Orphan branches from failed agents
    severity: medium
    mitigation: Add cleanup command; tg status can detect stale branches
tests:
  - "tg start with branching creates a Dolt branch"
  - "tg done with branching merges branch to main"
  - "Failed task can have its branch deleted (rollback)"
  - "Parallel agents work on separate branches without conflicts"
  - "Without branching config, behavior is unchanged"
todos:
  - id: branch-module
    content: "Create Dolt branch management module in src/db/branch.ts"
    intent: |
      Functions wrapping dolt CLI branch operations:
      - createBranch(repoPath, branchName): dolt branch <name>
      - checkoutBranch(repoPath, branchName): dolt checkout <name>
      - mergeBranch(repoPath, from, to): dolt checkout <to> && dolt merge <from>
      - deleteBranch(repoPath, branchName): dolt branch -d <name>
      - currentBranch(repoPath): dolt branch --show-current
      All return ResultAsync<T, AppError>.
    changeType: create
    domain: [schema]
  - id: branch-aware-connection
    content: "Make doltSql branch-aware via connection context"
    intent: |
      Update connection.ts so doltSql can operate on a specific branch.
      Add optional branch parameter or use dolt checkout before queries.
      Alternatively, use Dolt's USE database/branch syntax.
    blockedBy: [branch-module]
    changeType: modify
    domain: [schema]
  - id: start-branching
    content: "Add --branch flag to tg start that creates a Dolt branch"
    intent: |
      When tg start <taskId> --branch (or when config.useDoltBranches is true),
      create branch agent/<taskId>, checkout to it. All subsequent doltSql calls
      operate on this branch. Store branch name in started event body.
    blockedBy: [branch-aware-connection]
    changeType: modify
    domain: [cli]
    skill: [cli-command-implementation]
  - id: done-merge
    content: "Add branch merge to tg done when branch was used"
    intent: |
      When completing a task that was started with --branch, merge the agent branch
      back to main and delete the branch. If merge conflicts, report error and
      leave the branch for manual resolution.
    blockedBy: [branch-module]
    changeType: modify
    domain: [cli]
    skill: [cli-command-implementation]
  - id: branch-config-flag
    content: "Add useDoltBranches config option"
    intent: |
      Optional boolean in .taskgraph/config.json. When true, tg start auto-creates
      branches. Default false for backward compatibility.
    changeType: modify
  - id: branch-integration-tests
    content: "Integration tests for Dolt branch lifecycle"
    intent: |
      In a test Dolt repo: start task with branching, verify branch exists,
      make changes, done with merge, verify changes on main, verify branch deleted.
      Test rollback: start, make changes, delete branch, verify main unchanged.
    blockedBy: [start-branching, done-merge]
    changeType: test
    skill: [integration-testing]
  - id: branch-update-docs
    content: "Document Dolt branching in architecture.md"
    intent: |
      Explain the branch-per-agent pattern, when to enable it, and how it
      provides rollback safety. Update architecture.md data flow diagram.
    changeType: document
    skill: [documentation-sync]
isProject: false
---

## Analysis

DoltHub's "YOLO to FAFO" blog post argues that version-controlled database branches enable agents
to safely experiment - they can make changes on a branch, and if something goes wrong, the branch
is simply deleted. Task-Graph uses Dolt but currently all agents commit to the same working branch.

With branch-per-agent, each implementer's task graph mutations (status changes, events) happen on
an isolated branch. On successful completion, the branch is merged to main. On failure, it's
deleted — zero impact on the shared state.

## Branch flow

```mermaid
sequenceDiagram
  participant O as Orchestrator
  participant D as Dolt
  participant A as Agent

  O->>D: dolt branch agent/task-123
  O->>A: dispatch implementer
  A->>D: dolt checkout agent/task-123
  A->>D: INSERT event (started) on branch
  A->>D: UPDATE task status on branch
  A->>D: INSERT event (done) on branch
  A->>D: dolt commit on branch
  A->>O: done
  O->>D: dolt checkout main
  O->>D: dolt merge agent/task-123
  O->>D: dolt branch -d agent/task-123
```

## Dolt merge behavior

Dolt does cell-level merge (not line-level like git). Since different agents modify different task
rows, conflicts are extremely unlikely. The main risk is two agents updating the same row (e.g.
both updating a shared plan's status), which should be prevented by the dispatch rule's file
conflict check.

<original_prompt>
Have implementer agents work on Dolt branches for safe rollback,
inspired by DoltHub's "YOLO to FAFO" pattern for agentic workflows.
</original_prompt>
