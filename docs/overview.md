---
triggers:
  files: ["docs/**", "README.md"]
  change_types: ["create", "modify"]
  keywords: ["overview", "system", "entrypoints", "flows", "how it works"]
---

# How the System Works

Single-page narrative: entrypoints, data, main flows, and outcomes. For layer and schema detail see [architecture](architecture.md) and [schema](schema.md).

## 1. Entrypoints

- **CLI** — The `tg` command (Commander.js) is the primary interface. All planning, task execution, and export go through it. See [cli-reference](cli-reference.md).
- **MCP** — The `tg-mcp` server exposes read-only tools (status, context, next, show) so other agents and IDEs can read the task graph without running the CLI. Same data model as the CLI. See [mcp](mcp.md).

## 2. Data

The task graph lives in a **Dolt** repository (e.g. `.taskgraph/dolt/`). Core tables:

- **project** — Plans imported from markdown; title, intent, status (draft/active/…), optional file_tree, risks, tests.
- **task** — Units of work; status (todo/doing/blocked/done/canceled), intent, acceptance, links to project.
- **edge** — Dependencies between tasks (`blocks`, `relates`).
- **event** — Immutable log: started, done, note, etc.; event body is JSON.

Optional tables: initiative, cycle, gate, plan_worktree. See [schema](schema.md).

## 3. Main Flows

- **Plan to graph** — Plan file in `plans/` → `tg import plans/<file> --plan "<Name>" --format cursor` → creates/updates **project** and **task** rows (and edges from `blockedBy`).
- **Execution** — `tg next` (runnable tasks) → `tg show` → `tg start [--agent] [--worktree]` → work → `tg done [--merge] --evidence "..."`. See [agent-contract](agent-contract.md) § Execution loop (reference).
- **Skill to lead to workers** — User invokes a skill (e.g. `/work`, `/plan`) → skill creates a **lead** → lead dispatches **workers** (implementer, reviewer, etc.) → lead synthesizes and reports. See [agent-strategy](agent-strategy.md).
- **Worktrees and merge** — With `tg start --worktree`, the plan can have a **plan branch** (`plan-p-*`) and per-task worktrees (`tg-*`). `tg done --merge` merges the task branch into the plan branch (or main if no plan worktree). See [multi-agent](multi-agent.md) § Worktree and merge flow.

## 4. Outcomes

- **Done tasks** — Status and events updated; evidence and optional checks stored.
- **Export** — `tg export mermaid` / `dot` / `markdown` for graphs and reports.
- **Gate** — Lint, typecheck, tests. `gate:full` is run from the **plan worktree** after tasks are merged, not from main. See [agent-contract](agent-contract.md) § gate:full Orchestration Rules.

## See also

- [Architecture](architecture.md) — Layers, repo layout, data flow, error handling.
- [Schema](schema.md) — Tables, columns, state machine.
- [Agent contract](agent-contract.md) — Operating loop, blocking, gate rules.
- [Multi-agent](multi-agent.md) — Worktrees, merge target, coordination.
