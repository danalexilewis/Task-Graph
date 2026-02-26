# Skill guides

Tasks can set a `skill` that maps to a guide here. The agent reads `docs/skills/<skill>.md` before starting work.

## Example skills

| Skill | Purpose |
|-------|---------|
| [taskgraph-lifecycle-execution](taskgraph-lifecycle-execution.md) | Execute tasks with correct `start → context → done` transitions |
| [plan-authoring](plan-authoring.md) | Write Cursor-format plans that import cleanly into TaskGraph |
| [refactoring-safely](refactoring-safely.md) | Behavior-preserving changes: small steps, test before/after |

Use the slug (e.g. `taskgraph-lifecycle-execution`) as the task's `skill` in plan YAML.

