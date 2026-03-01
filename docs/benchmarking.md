---
triggers:
  files: ["docs/benchmarking.md", "scripts/**"]
  change_types: ["create", "modify"]
  keywords: ["benchmark", "benchmarking", "performance", "runbook", "metrics", "profiling", "tg stats"]
---

# Benchmarking

This runbook outlines the procedures, conventions, and best practices for benchmarking Task Graph plans and measuring performance metrics.

## Prerequisites

- Ensure environment variables are set:
  - `TG_QUERY_CACHE_TTL_MS` (optional) for caching
  - `TG_DOLT_SERVER_PORT` and `TG_DOLT_SERVER_DATABASE` for persistent SQL server mode
- Install dependencies: `pnpm install`
- Access to a representative dataset in `.taskgraph/dolt`

## Running Benchmarks

1. Start Dolt SQL server (optional but recommended for low latency):
   ```bash
   dolt sql-server --port 3306 --data-dir .taskgraph/dolt
   export TG_DOLT_SERVER_PORT=3306
   export TG_DOLT_SERVER_DATABASE=dolt
   ```
2. Execute benchmark command:
   ```bash
   tg stats --plan <planId> --json > benchmarks/plan-<planId>.json
   ```
3. Record results:
   - Store the JSON output under `benchmarks/` with a timestamp.
   - Parse key metrics: total duration, velocity, pass/fail rates.

## Naming Conventions

- Use `benchmarks/plan-<planId>-YYYYMMDD.json` for output files.
- Tag benchmark runs with date and commit SHA for traceability.

## Interpreting Results

- Compare `duration_ms` and `tasks_completed` against baseline.
- Alert if plan velocity drops below `threshold_tasks_per_hr`.
- Investigate high variance (>20% std deviation) across runs.

## Updating Baselines

- When performance improvements are made, update baseline files in `benchmarks/baseline-<planId>.json`.
- Document changes in version control.

## Best Practices

- Run benchmarks on an idle machine to reduce noise.
- Repeat runs at least 3 times and use median values.
- Use a Docker container or dedicated CI agent for consistent environment.

## References

- See `docs/performance.md` for domain-level performance guidance.
- Benchmark results conventions align with [Performance Intelligence (2026-03-01)](performance.md).
