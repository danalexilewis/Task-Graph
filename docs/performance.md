---
triggers:
  files: ["docs/performance.md", "src/**"]
  change_types: ["create", "modify"]
  keywords:
    [
      "performance",
      "benchmarking",
      "token",
      "analytics",
      "tg stats",
      "recovery",
      "investigator fix rate",
    ]
---

# Performance

This doc covers system requirements for running parallel sub-agents, how to interpret `tg stats` output, optimization patterns for reducing token cost and execution time, and recovery metrics for reliability analysis.

## Data sources

The **single source of truth** for agent invocations and agent hours is the **Dolt `event` table** (see [schema](schema.md)). All of the following are derived from it:

- **Total Agent Invocations** — count of `done` events
- **Total Agent hours** — sum of (done time − latest started time) per task, in hours
- Per-task elapsed time, plan duration, velocity, reviewer/investigator metrics, and self-reported token/tool-call data

There is no separate system log or other store for these metrics. The optional **agent context** subsystem (SQLite `.taskgraph/agent_context.db`, when implemented) would provide operational telemetry from terminal `[tg:event]` lines for cross-agent visibility; it does **not** drive status or stats numbers. See [agent-context](agent-context.md).

## Key Performance Metrics

These metrics are available from the Dolt event table without any additional capture:

| Metric                  | How to get it                                                        | Command                   |
| ----------------------- | -------------------------------------------------------------------- | ------------------------- |
| Per-task elapsed time   | `started` → `done` event TIMESTAMPDIFF                               | `tg stats --plan <id>`    |
| Plan total duration     | MIN(started) → MAX(done) for all tasks                               | `tg stats --plan <id>`    |
| Plan velocity           | tasks ÷ duration in hours                                            | `tg stats --plan <id>`    |
| Cross-plan history      | Timeline of all plans with duration                                  | `tg stats --timeline`     |
| Reviewer pass/fail rate | `note` events with `"type":"review"`                                 | `tg stats` (default view) |
| Investigator fix rate   | Gate (`gate:full`) failure → subsequent pass on run-full-suite tasks | `tg stats --recovery`     |

Self-reported metrics (agents pass via `tg done` flags):

| Metric         | Flag               | Interpretation                                          |
| -------------- | ------------------ | ------------------------------------------------------- |
| Input tokens   | `--tokens-in <n>`  | Context + prompt tokens for this session                |
| Output tokens  | `--tokens-out <n>` | Generated tokens; higher = more work done               |
| Tool calls     | `--tool-calls <n>` | Higher count = more search/edit cycles                  |
| Attempt number | `--attempt <n>`    | >1 means reviewer FAIL; high count = spec quality issue |

## Interpreting `tg stats` Output

### Default view: `tg stats`

Shows per-agent summary: tasks completed, average elapsed time, review pass/fail rate, and (when self-report data is present) token usage aggregates by agent.

### Recovery metrics: `tg stats --recovery`

Shows: number of plans with gate failures on the designated "run-full-suite" task, number of those plans where a subsequent gate pass occurred, and the investigator fix rate percentage.

**What to look for:**

- Low fix rate → issues in recovery workflow or flaky fixes; may need improved debugging strategies or tester integration.
- High fix rate → reliable investigator workflows and robust corrections.

## Productivity Benchmark

For custom minimal productivity benchmarking (Option C), see [the productivity benchmark README](../.benchmark/README.md). The `.benchmark/` directory is gitignored and contains self-contained problems for measuring agent productivity (success = run.sh exit 0, wall-clock time, and optional token usage via `tg done` flags).

## Runbooks

- [Benchmarking Runbook](benchmarking.md)

## Optimization Patterns

- **Reduce token cost per task** — Smaller context windows (fewer docs loaded via `tg context`) reduce `tokens_in`. Scope tasks narrowly so implementers read fewer files.
- **Shorten elapsed time** — Parallel task batches (≥2 tasks with no `blockedBy`) reduce wall-clock plan duration. Check `tg stats --plan <id>` to identify which tasks are bottlenecks.
- **Reduce reviewer FAILs** — High `attempt` counts indicate unclear specs or ambiguous acceptance criteria. Improve the task `body` and `suggestedChanges` fields.
- **Track velocity trends** — Use `tg stats --benchmark --timeline` across repeated benchmark runs to surface regressions or improvements over time.
