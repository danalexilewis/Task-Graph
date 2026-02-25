---
name: Agent Sync and Taskgraph Adoption
overview: 'Fix the root causes of agents losing sync with taskgraph: strengthen rules with concrete protocols, add tg status as a checkpoint, handle already-done work, and clean up stale tasks.'
todos:
  - id: plan-file-sync-on-done
    content: Add guidance to workflow rule — after marking last task in a plan done, run tg export markdown --plan <id> --out plans/<file> to update the plan file with final statuses
    status: completed
    blockedBy:
      - rewrite-workflow-rule
  - id: add-session-start-rule
    content: Create .cursor/rules/session-start.mdc — alwaysApply rule that instructs agent to run tg status at start of every session to orient, and before executing any plan tasks
    status: completed
  - id: rewrite-workflow-rule
    content: Rewrite taskgraph-workflow.mdc — add strict per-task protocol (MUST start before work, MUST done after), add tg status checkpoint before and after execution batches, add recovery protocol for stale tasks
    status: completed
  - id: add-done-force-guidance
    content: Update AGENT.md and workflow rule — document tg done --force for tasks that were completed out of band or where start was missed; agent should use this for cleanup
    status: completed
  - id: cleanup-stale-tasks
    content: Mark the 8 stale todo tasks from Cursor Plan Import and tg plan list as done with --force, since the work is already complete
    status: completed
  - id: add-multi-task-batch-rule
    content: Add to workflow rule — when executing multiple tasks in sequence, agent must follow start→work→done for EACH task individually, never batch-skip status transitions
    status: completed
    blockedBy:
      - rewrite-workflow-rule
isProject: false
---
