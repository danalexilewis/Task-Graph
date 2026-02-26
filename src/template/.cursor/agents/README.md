# Sub-Agent Definitions

This directory contains **prompt templates** for specialized sub-agents dispatched via Cursor's Task tool. The orchestrating agent (session model) reads these templates, interpolates them with task-specific data from `tg context --json`, and dispatches sub-agents with `model="fast"` for cost-effective parallel execution.

## Directory layout

- **README.md** (this file) — format, conventions, and how to add agents
- **explorer.md** — codebase exploration and context gathering (no code writing)
- **implementer.md** — execute a single task (tg start → work → tg done)
- **reviewer.md** — spec compliance and quality check (PASS/FAIL)
- **planner-analyst.md** — pre-plan codebase analysis for the planning model

Agent files are **prompt templates**, not executable code. The orchestrator injects context at dispatch time.

## Agent file format

Each agent file (e.g. `implementer.md`) should include:

1. **Purpose** — One or two sentences: when this agent is used and what it does.
2. **Model** — Always `fast` for dispatched sub-agents (orchestrator uses session model).
3. **Input contract** — What the orchestrator must pass: e.g. task_id, tg context JSON, optional explorer output.
4. **Output contract** — What the agent returns: e.g. "completed + evidence", "PASS/FAIL + issues", "structured analysis document".
5. **Prompt template** — The body of the prompt. Use placeholders the orchestrator will replace, e.g. `{{TASK_ID}}`, `{{CONTEXT_JSON}}`, `{{INTENT}}`.

The orchestrator builds the final prompt by substituting these placeholders, then calls the Task tool with `prompt=<built prompt>` and `model="fast"`.

## Naming conventions

- **File names**: kebab-case, e.g. `planner-analyst.md`, `implementer.md`.
- **Agent identity for tg**: When multiple implementers run in parallel, use unique names like `implementer-1`, `implementer-2` so `tg status` shows distinct workers.
- **No YAML frontmatter required** — these are not Cursor plugin agent definitions; they are content that the dispatch rule and orchestrator interpret.

## How dispatch works

1. Orchestrator runs `tg next --json --limit 4` to get unblocked tasks.
2. For each task, orchestrator runs `tg context <taskId> --json` and optionally runs the explorer.
3. Orchestrator reads the appropriate agent template (e.g. `implementer.md`), replaces placeholders with the task's context.
4. Orchestrator calls the Task tool: `Task(description="...", prompt=<interpolated prompt>, model="fast")`.
5. Sub-agent runs in its own context, runs `tg start <taskId> --agent <name>`, does the work, runs `tg done <taskId> --evidence "..."`.

Placeholders commonly used:

| Placeholder             | Source                                   | Example           |
| ----------------------- | ---------------------------------------- | ----------------- |
| `{{TASK_ID}}`           | task_id from tg next                     | UUID              |
| `{{CONTEXT_JSON}}`      | Output of `tg context <taskId> --json`   | JSON object       |
| `{{TITLE}}`             | context.title                            | Task title string |
| `{{INTENT}}`            | context / task intent                    | Multi-line intent |
| `{{DOMAIN_DOCS}}`       | context.domain_docs                      | Paths to read     |
| `{{SKILL_DOCS}}`        | context.skill_docs                       | Paths to read     |
| `{{SUGGESTED_CHANGES}}` | context.suggested_changes                | Optional snippet  |
| `{{EXPLORER_OUTPUT}}`   | Optional; output from explorer sub-agent | Structured text   |

## Adding a new agent

1. Create `<agent-name>.md` in `.cursor/agents/` with Purpose, Model, Input contract, Output contract, and Prompt template.
2. Document the placeholders the orchestrator must fill.
3. Update `.cursor/rules/subagent-dispatch.mdc` to describe when to use the new agent and how to build its prompt.
4. Optionally add a short mention in `docs/skills/subagent-dispatch.md`.

## References

- Dispatch rule: `.cursor/rules/subagent-dispatch.mdc`
- Skill guide: `docs/skills/subagent-dispatch.md`
- Task graph workflow: `.cursor/rules/taskgraph-workflow.mdc`
