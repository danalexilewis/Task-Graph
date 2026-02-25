# taskgraph-lifecycle-execution

Use this guide when you are executing tasks in a TaskGraph-backed repo and want to avoid status drift and missing context.

## Standard loop (per task)

1. `tg start <taskId>`
2. `tg context <taskId>` (read the printed docs and any related done tasks)
3. Make the change (stay within task scope)
4. `tg done <taskId> --evidence "tests run, commands, commit hashes"`

If your repo doesn’t have `tg` on PATH, you might use `pnpm tg ...` or `npx tg ...` depending on how you installed the CLI.

## Recovery

- If work is done but the task is still `todo`: `tg done <taskId> --force --evidence "completed previously"`
- If a task is stuck in `doing`: `tg done <taskId> --evidence "completed previously"`

## When blocked

- `tg block <taskId> --on <blockerId> --reason "..."` (block on an existing task)
- If the blocker doesn’t exist: create a new task (owner=human) and block on it.

