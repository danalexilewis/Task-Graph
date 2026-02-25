Plan creation and review

- When the user asks for a plan: create `plans/<name>.md` in Cursor format (YAML frontmatter with `name`, `overview`, `todos`). Summarize the plan, then pause and ask for review.
- Interpret user response using this table:

| User says | Meaning | Agent action |
|-----------|---------|--------------|
| proceed, go ahead, execute, run it, let's do it | Approve and execute | Run `tg import plans/<file> --plan "<Plan Name>" --format cursor`, then enter the execution loop below |
| just add the tasks, add to taskgraph only, import but don't run | Add to graph only | Run `tg import plans/<file> --plan "<Plan Name>" --format cursor`. Do not execute tasks |
| thanks, that's good, looks good, ok, don't do anything | Acknowledgement only | Do nothing. No import, no execution |

Agent operating loop

- Always begin with: tg status to orient — surface stale tasks, plan state, and other agents' active work (if any).
- Then: tg next --limit 5 and choose the top runnable task.
- Before coding: tg show <taskId> and restate:
  - intent
  - scope in/out
  - acceptance checks
- Then: tg start <taskId> [--agent <name>] — MUST run before any work. When multiple agents may be active, pass --agent so others see who is working.
- Execute exactly within scope.
- When done: tg done <taskId> --evidence "..." — MUST run immediately after work is complete.
  Include in evidence:
  - tests run
  - commands output summary
  - git commit hash(es)

Per-task discipline

- Complete start→work→done for EACH task individually.
- Never batch-skip transitions (e.g., doing all work then marking all done).

Recovery (out-of-sync tasks)

- Task is `todo` but work is already done: `tg done <taskId> --force --evidence "completed previously"`
- Task is `doing` but work is already done: `tg done <taskId> --evidence "completed previously"`
- Run `tg status` after cleanup to verify.
- Use `--force` only for legitimate out-of-band completion, never to bypass workflow.

Plan completion

After marking the last task in a plan as done, run:
  tg export markdown --plan <planId> --out plans/<file>
This updates the plan file with final statuses.

When blocked

- If blocked by missing prerequisite, run:
  - tg block <taskId> --on <blockerTaskId> --reason "..."
- If blocker does not exist:
  - create a new task with owner=human and status todo, then block on it.

Decisions

- If a decision is required to proceed:
  - create a task: "Decide: …" with owner=human
  - add a decision_needed event with options + recommendation
  - stop and ask for approval

Safe graph edits the agent may do without asking

- status transitions (todo→doing→done, blocked when real blocker exists)
- add a dependency when it's objectively required ("API endpoint must exist before UI integration")
- split a task when it exceeds ~90 minutes, keeping scope and acceptance intact

Everything else is proposal-only.

Multi-agent awareness (when 2–3 agents work alongside the human)

- Always pass --agent <session-name> on tg start so other agents see who claimed each task.
- Read "Active work" from tg status before picking a task; avoid overlapping on the same files/area.
- Use tg note <taskId> --msg "..." to leave breadcrumbs when changing shared interfaces (types, schema, parser).
- Do not pick a task in the same area as another agent's doing task without human approval.
