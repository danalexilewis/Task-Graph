# Doc Review Benchmark — Accuracy Summary

**Date:** 2026-03-03  
**Plan:** Doc Review Benchmark (benchmark plan; 3 tasks)

## Result summary

| Doc | Pass/Fail | Discrepancies |
|-----|-----------|---------------|
| `docs/cli-reference.md` | — | (from task *review-cli-reference*: compare with `tg --help` and subcommand `--help`; list missing flags, incorrect descriptions, outdated defaults) |
| `docs/benchmarking.md` | — | (from task *review-benchmarking-doc*: CLI commands vs help, "How to Run" steps, `scripts/run-benchmark.ts` usage) |

*This summary was produced from the plan structure. Per-run pass/fail and discrepancy lists should be filled from the evidence of the two review tasks when available.*

## What this benchmark measures

- **Accuracy:** Do docs match actual CLI behavior (help output, commands, options)?
- **Consistency:** Is the benchmarking runbook aligned with plan format and available CLI (`tg import`, `tg stats`, `tg done` options)?
- **Contribution of the two review tasks:** Task 1 (cli-reference) checks reference doc vs `tg`; Task 2 (benchmarking.md) checks runbook vs reality. The summary task (this doc) records pass/fail and discrepancies for comparison across benchmark runs.
