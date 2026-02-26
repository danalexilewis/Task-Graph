# Skill: Sub-agent dispatch

## Purpose

Execute task-graph work by dispatching fast sub-agents (Cursor Task tool with `model="fast"`) instead of doing every task yourself. Use parallel batch execution when multiple unblocked tasks exist; use the planner-analyst before writing a plan so the expensive model focuses on reasoning, not codebase exploration.

## Inputs

- A plan with runnable tasks (`tg next`) or a user request to create a new plan
- Agent templates in `.cursor/agents/` (implementer, reviewer, explorer, planner-analyst)
- Rule: `.cursor/rules/subagent-dispatch.mdc`

## When to use

- **Parallel batch**: You are executing a plan and `tg next` returns 2+ unblocked tasks that do not share files — dispatch implementers concurrently, then reviewers.
- **Sequential**: One runnable task or tasks that share files — optional explorer, then implementer, then reviewer.
- **Plan analysis**: Before writing a new plan — dispatch planner-analyst, then use its output when drafting the plan.

## When not to use

- Exploratory or ambiguous work — do it yourself (direct execution).
- Only one task and you prefer to stay in flow — direct execution is fine.
- Sub-agent failed twice on the same task — fall back to direct execution.

## Steps (parallel batch)

1. `tg next --plan "<Plan>" --json --limit 4`
2. If tasks share files (from file_tree/suggested_changes), reduce the batch to independent tasks only.
3. For each task: `tg context <taskId> --json`; build implementer prompt from `.cursor/agents/implementer.md` placeholders.
4. Dispatch up to 4 Task(model="fast", prompt=…) concurrently with agent names implementer-1, implementer-2, …
5. When each completes, build reviewer prompt from `.cursor/agents/reviewer.md` (context + diff); dispatch Task(model="fast", …). On FAIL, re-dispatch implementer once with feedback.
6. Repeat from step 1 until no runnable tasks or plan is complete.

## Steps (plan analysis)

1. Build planner-analyst prompt from `.cursor/agents/planner-analyst.md` with user request; optionally include `tg status` output.
2. Dispatch Task(model="fast", prompt=…).
3. Use analyst output (relevant files, patterns, risks, rough breakdown) when writing the plan.

## Gotchas

- Always pass `model="fast"` on Task calls for sub-agents. The cost saving depends on it.
- Implementer must run `tg start` and `tg done` — the template says so; ensure the built prompt includes the correct task ID and agent name.
- File overlap: parallel dispatch only for tasks that do not touch the same files. When in doubt, run sequentially.
- After 2 implementer failures (or 2 reviewer FAILs) on the same task, complete that task yourself.

## Definition of done

- Tasks are done in taskgraph (`tg done` run by sub-agent or by you).
- Evidence on each done task.
- No orphaned doing tasks; if you used sub-agents, each ran tg start/done.
- Plan file updated after last task (tg export markdown).
