---
triggers:
  files: ["docs/benchmarking.md", "plans/**"]
  change_types: ["create", "modify"]
  keywords: ["benchmark", "benchmarking", "performance", "metrics", "runbook", "is_benchmark"]
---

# Benchmarking Runbook

A step-by-step guide for running consistent, reproducible benchmarks using the Task-Graph CLI.

## What is a Benchmark Plan?

A benchmark plan is a regular Cursor-format plan with `benchmark: true` in its YAML frontmatter:

```yaml
---
name: My Benchmark
overview: Fixed-scope plan for measuring X.
benchmark: true
todos:
  - id: task-a
    content: Do something measurable
    agent: implementer
    changeType: test
  - id: task-b
    content: Do something else
    agent: implementer
    blockedBy: [task-a]
---
```

When imported, `benchmark: true` sets `project.is_benchmark = true` in the database. This marks the project so it can be filtered separately from regular work plans in stats and history queries.

## Sample Benchmark Plans

Two ready-to-run benchmark plans live in `plans/`:

| Plan file | Name | Tasks | Description |
|-----------|------|-------|-------------|
| `plans/26-03-02_benchmark_cli_smoke.md` | CLI Smoke Benchmark | 3 | Verifies status/stats output format and runs pnpm gate |
| `plans/26-03-02_benchmark_doc_review.md` | Doc Review Benchmark | 3 | Reviews CLI docs for accuracy; outputs a findings summary |

## How to Run a Benchmark Plan

### Step 1 — Import the plan

```bash
pnpm tg import plans/<benchmark-file>.md --plan "<Plan Name>" --format cursor
```

Note the project ID printed after import (e.g. `p-abc123`).

### Step 2 — Execute the plan

Start a session and invoke the work skill:

```
/work
```

The `/work` skill picks up runnable tasks from the plan and dispatches implementer sub-agents. Tasks with `blockedBy` run after their blockers complete.

Alternatively, run tasks manually:

```bash
pnpm tg next --plan "<Plan Name>" --json --limit 8
# then for each task:
pnpm tg start <taskId> --agent implementer
# ... do the work ...
pnpm tg done <taskId> --evidence "..." --tokens-in <n> --tokens-out <n> --tool-calls <n>
```

### Step 3 — Capture metrics

After all tasks are done:

```bash
pnpm tg stats --plan <planId>
```

This outputs a per-task elapsed table and plan summary (total duration, velocity, reviewer pass/fail rate).

### Step 4 — Compare runs over time

To see all benchmark runs (and all plans) sorted by date:

```bash
pnpm tg stats --timeline
```

Run the same benchmark plan multiple times (each import creates a new project) to track agent performance trends.

## Repeating a Benchmark

Each `tg import` of the same plan file creates a new project row with the same tasks. Import, execute, and compare across the multiple projects using `tg stats --timeline`.

## Self-Reported Metrics

Agents can pass performance data when marking a task done:

```bash
pnpm tg done <taskId> \
  --evidence "task completed; gate passed" \
  --tokens-in 1200 \
  --tokens-out 800 \
  --tool-calls 14 \
  --attempt 1
```

These metrics surface in `tg stats` aggregated by agent, enabling comparison of token efficiency across runs.

## CLI Usage Reference

| Command | Description |
|---------|-------------|
| `tg stats --plan <planId>` | Per-task elapsed table and plan summary |
| `tg stats --timeline` | Cross-plan history sorted by date |
| `tg stats --recovery` | Investigator fix rate |
| `tg stats --agent <name>` | Filter metrics by agent |

## Scripts

- `scripts/run-benchmark.ts`: Runs shell commands sequentially, measures execution duration and exit code, and outputs results in JSON or CSV.

  ```bash
  # JSON output (default)
  bun scripts/run-benchmark.ts "echo hello" "pnpm gate"

  # CSV output
  bun scripts/run-benchmark.ts --csv "echo hello" "pnpm gate"
  ```

## Best Practices

- Run each benchmark at least 3 times and average the results.
- Use a dedicated benchmark branch or worktree to avoid interference with in-progress work.
- Isolate the environment: close other applications, use consistent CPU/memory settings.
- Record environment details (OS, CPU, memory) alongside results.
- Use `--tokens-in`, `--tokens-out`, `--tool-calls`, and `--attempt` on every `tg done` in benchmark plans so token metrics are captured.
- Keep benchmark tasks tightly scoped (under 30 minutes each) so results are comparable.

## Related

- [Performance](performance.md) — key metrics, productivity benchmarks, optimization patterns.
- [Plan Format](plan-format.md) — full reference for YAML frontmatter including the `benchmark` field.
- [CLI Reference](cli-reference.md) — `tg stats` command options.
