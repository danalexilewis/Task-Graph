---
name: Benchmark Stats and Recovery
overview: Add tg stats --benchmark filter and investigator fix rate to tg stats, plus tests. Part of the TaskGraph Benchmarking initiative (Project 3). Requires Project 2 (Benchmark Schema and Import) to be done so project.is_benchmark exists.
fileTree: |
  src/
  └── cli/
      └── stats.ts                      (modify)
  docs/
  ├── performance.md                    (modify)
  └── cli-reference.md                  (modify)
  __tests__/
  └── (integration or unit)             (create or modify)
risks:
  - description: Investigator fix rate relies on heuristic (run-full-suite task by title or last task) and free-text evidence
    severity: low
    mitigation: Document heuristic; accept substring match for first version; refine in follow-up if needed
tests:
  - "tg stats --timeline --benchmark returns only projects where is_benchmark = 1"
  - "Investigator fix rate (Recovery block) appears in stats output when applicable"
todos:
  - id: stats-benchmark-filter
    content: Add tg stats --benchmark filter for timeline and plan view
    agent: implementer
    intent: |
      In src/cli/stats.ts add option --benchmark. When --timeline is used and --benchmark is set, add AND p.is_benchmark = 1 to the timeline SQL (FROM project p ... GROUP BY ...). When --plan <id> is used and --benchmark is set, require the selected plan to have is_benchmark = 1 (otherwise no data or clear message). Update docs/cli-reference.md and docs/performance.md for the new flag.
    changeType: modify
    docs: [performance, cli-reference]
    skill: cli-command-implementation
  - id: investigator-fix-rate
    content: Add investigator fix rate to tg stats (query and display)
    agent: implementer
    intent: |
      Derive from events: per project, identify the run-full-suite task (heuristic: task title containing "run full suite" or "run-full-suite" or "gate:full", or last task by dependency order). For that task, get done events ordered by created_at. If any done has evidence containing "gate:full failed", count as had_failure; if a later done has evidence containing "gate:full passed", count as fixed. Investigator fix rate = plans with fixed / plans with had_failure (or show both counts). Add a "Recovery" block to default tg stats output (or a --recovery flag) and document in docs/performance.md and docs/cli-reference.md.
    changeType: modify
    docs: [performance, schema, cli-reference]
    skill: cli-command-implementation
  - id: add-tests
    content: Add tests for stats --benchmark filter
    agent: implementer
    blockedBy: [stats-benchmark-filter]
    intent: |
      Unit or integration tests: tg stats --timeline --benchmark returns only projects where is_benchmark = 1. Prefer integration tests if they touch Dolt and CLI.
    changeType: test
    docs: [testing]
  - id: run-full-suite
    content: Run full test suite (pnpm gate:full) and record result in evidence
    agent: implementer
    blockedBy: [add-tests, investigator-fix-rate]
    intent: |
      Run pnpm gate:full from the plan worktree (or repo root if no worktree). Confirm all tests pass. Document result in tg done evidence (e.g. "gate:full passed" or "gate:full failed: <summary>").
    changeType: test
isProject: false
---

## Analysis

This plan is **Project 3** of the TaskGraph Benchmarking initiative. It adds filtering and recovery metrics to `tg stats` so benchmark runs can be measured and investigator fix rate can be observed. **Prerequisite:** Project 2 (Benchmark Schema and Import) must be done so `project.is_benchmark` exists and is set on import.

## Dependency graph

```
Parallel start:
  ├── stats-benchmark-filter
  └── investigator-fix-rate

After stats-benchmark-filter:
  └── add-tests

After add-tests and investigator-fix-rate:
  └── run-full-suite
```

## Original prompt

<original_prompt>
Extracted from Agentic Benchmarking plan for Initiative Project 3 (Benchmark Stats and Recovery).
</original_prompt>
