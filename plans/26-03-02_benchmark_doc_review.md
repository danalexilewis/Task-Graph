---
name: Doc Review Benchmark
overview: Fixed-scope benchmark plan that measures agent accuracy when reviewing documentation against CLI behavior.
benchmark: true
todos:
  - id: review-cli-reference
    content: Review docs/cli-reference.md for accuracy against tg --help output
    agent: documenter
    changeType: investigate
    intent: |
      Run `pnpm tg --help` and each subcommand's `--help` (status, stats, import, context, done, start, next).
      Compare the output with the flags documented in docs/cli-reference.md.
      List any discrepancies (missing flags, incorrect descriptions, outdated defaults) in evidence.
      Do NOT edit the doc - only record findings.
  - id: review-benchmarking-doc
    content: Verify docs/benchmarking.md is consistent with benchmark plan format and available CLI commands
    agent: documenter
    changeType: investigate
    intent: |
      Read docs/benchmarking.md and cross-check:
      1. CLI commands listed match actual tg help output.
      2. The "How to Run" steps are accurate.
      3. The scripts/run-benchmark.ts usage example matches the script's actual interface.
      Record any inconsistencies in evidence. Do NOT edit.
  - id: summarize-doc-accuracy
    content: Write a brief accuracy summary based on the two review tasks
    agent: documenter
    changeType: document
    intent: |
      Using the evidence from tg context (previous task notes and done events for this plan),
      write a brief accuracy summary in docs/benchmarks/26-03-02_doc_review_result.md (create dirs if needed).
      Format: date, plan ID, pass/fail per doc, list of discrepancies found (or "none").
      Keep it under 20 lines.
---

# Doc Review Benchmark

A fixed-scope benchmark plan for measuring how accurately and quickly agents can review documentation against live CLI behavior. No code changes - read-only investigation tasks followed by a structured summary.

## Purpose

This benchmark measures:
- Time to complete a documentation accuracy review (3 tasks)
- Agent accuracy when cross-checking docs vs. CLI output
- Consistency of findings across benchmark runs

## How to Run

### 1. Import

```bash
pnpm tg import plans/26-03-02_benchmark_doc_review.md --plan "Doc Review Benchmark" --format cursor
```

Note the project ID from the import output.

### 2. Execute via /work

Start a session and run:

```
/work
```

The first two review tasks are independent and can run in parallel. The summary task should be run after both complete.

**Note:** For the summary task, start it last and reference the evidence from the prior two tasks via `tg context`.

### 3. Capture metrics after completion

```bash
pnpm tg stats --plan <planId>
```

Record: plan total duration, per-task elapsed times.

### 4. Review the output

The summary task writes `docs/benchmarks/26-03-02_doc_review_result.md`. Check it for completeness and accuracy.

## Comparing Runs

Import the plan again and compare:

```bash
pnpm tg stats --timeline
```

Changes in elapsed time or discrepancy count across runs signal regressions in agent context-loading or doc drift.

<original_prompt>
Create a second fixed-scope benchmark plan with benchmark: true that has 2-3 clearly scoped doc-review tasks, suitable for measuring agent accuracy over time.
</original_prompt>
