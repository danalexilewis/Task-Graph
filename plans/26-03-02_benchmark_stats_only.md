---
name: Stats Benchmark Only
overview: Fixed-scope benchmark plan for running stats on an existing plan.
benchmark: true
todos:
  - id: run-stats-only
    content: "Run `tg stats --plan <plan-id> --timeline --benchmark` for the provided plan"
---

# Stats Benchmark Only

How to run:

1. Run benchmark stats for an imported plan:
   ```bash
   pnpm tg stats --plan <plan-id> --timeline --benchmark
   ```
