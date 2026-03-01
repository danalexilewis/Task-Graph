---
name: CLI Benchmark Small
overview: Fixed-scope benchmark plan for CLI import and stats commands.
benchmark: true
todos:
  - id: import-cli-benchmark
    content: "Import the CLI benchmark plan"
    changeType: test
  - id: run-cli-stats-benchmark
    content: "Run `tg stats --plan <id> --timeline --benchmark`"
    changeType: test
---

# CLI Benchmark Small

How to run:
1. Import the plan:
   ```bash
   pnpm tg import plans/26-03-02_benchmark_cli_small.md --plan "CLI Benchmark Small" --format cursor
   ```
2. Execute the plan:
   ```bash
   pnpm tg work --plan "<plan-id>"
   ```
3. Run benchmark stats:
   ```bash
   pnpm tg stats --plan <plan-id> --timeline --benchmark
   ```

<original_prompt>
Create one fixed-scope benchmark plan file with frontmatter benchmark: true and include "How to run" instructions.
</original_prompt>
