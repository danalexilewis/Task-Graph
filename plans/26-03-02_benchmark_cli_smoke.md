---
name: CLI Smoke Benchmark
overview: Fixed-scope benchmark plan that exercises core CLI commands and verifies output format.
benchmark: true
todos:
  - id: verify-status-output
    content: Run tg status and verify the output matches expected format from cli-tables.md
    agent: implementer
    changeType: test
    intent: |
      Run `pnpm tg status --tasks` and confirm the output renders a table with columns
      Id, Title, Project, Status, Owner. Verify against the column layout defined in
      docs/cli-tables.md. Record any discrepancies in evidence.
  - id: verify-stats-output
    content: Run tg stats and verify the per-agent summary table is present and readable
    agent: implementer
    changeType: test
    intent: |
      Run `pnpm tg stats` and confirm the output includes a per-agent summary with columns
      for tasks completed, average elapsed time, and review pass/fail rate.
      Record the actual output in evidence for comparison across benchmark runs.
  - id: run-gate-smoke
    content: Run pnpm gate and record result in evidence
    agent: implementer
    changeType: test
    intent: |
      Run `pnpm gate` (lint + typecheck on changed files + affected tests).
      Record pass/fail and any error lines in evidence.
      Evidence format: "gate: PASS" or "gate: FAIL - <summary>".
---

# CLI Smoke Benchmark

A small fixed-scope plan for benchmarking basic CLI command responsiveness and output correctness. Use this plan to measure how quickly agents can verify core CLI behavior.

## Purpose

This plan provides a repeatable baseline for measuring:
- Time to complete 3 independent verification tasks
- Agent accuracy when checking CLI output format
- Gate pass rate across benchmark runs

## How to Run

### 1. Import

```bash
pnpm tg import plans/26-03-02_benchmark_cli_smoke.md --plan "CLI Smoke Benchmark" --format cursor
```

Note the project ID from the import output (e.g. `p-abc123`).

### 2. Execute via /work

Start a session and run:

```
/work
```

The `/work` skill picks up runnable tasks and dispatches implementers automatically. All three tasks are independent and can run in parallel.

### 3. Capture metrics after completion

```bash
pnpm tg stats --plan <planId>
```

Record: plan total duration, per-task elapsed times, and any reviewer FAIL events.

## Comparing Runs

Import the plan again (creates a new project), execute, then compare:

```bash
pnpm tg stats --timeline
```

The timeline shows all benchmark runs sorted by date, making it easy to spot regressions.

<original_prompt>
Create a fixed-scope benchmark plan with benchmark: true that has 2-3 clearly scoped tasks for benchmarking agent CLI verification workflows.
</original_prompt>
