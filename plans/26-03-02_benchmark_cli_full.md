---
name: CLI Benchmark Full
overview: Fixed-scope benchmark plan for CLI import and execution commands.
benchmark: true
todos:
  - id: import-cli-benchmark-full
    content: "Import the CLI Benchmark Full plan"
  - id: run-cli-work-full
    content: "Execute the CLI Benchmark Full plan"
  - id: run-cli-stats-full
    content: "Run `tg stats --plan <plan-id> --timeline --benchmark`"
---

# CLI Benchmark Full

How to run:

1. Import the plan:
   ```bash
   pnpm tg import plans/26-03-02_benchmark_cli_full.md --plan "CLI Benchmark Full" --format cursor
   ```
2. Execute the plan:
   ```bash
   pnpm tg work --plan <plan-id>
   ```
3. Run benchmark stats:
   ```bash
   pnpm tg stats --plan <plan-id> --timeline --benchmark
   ```
