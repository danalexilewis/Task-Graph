---
name: Benchmark Runbook and Conventions
overview: Add benchmark plan definitions, implementer self-report checklist, and docs/benchmarking.md runbook. Initiative Project 4. Requires Project 2 (Schema and Import) so benchmark flag is set on import; optionally run after Project 3 for full stats.
fileTree: |
  docs/
  ├── benchmarking.md                   (create)
  ├── performance.md                    (modify)
  └── domains.md                        (modify)
  plans/
  └── benchmark_*.md                    (create, 1-2 files)
  .cursor/
  ├── agents/
  │   └── implementer.md                (modify)
  └── skills/
      └── work/
          └── SKILL.md                  (modify)
risks:
  - description: Benchmark plan definitions may drift from actual run procedure
    severity: low
    mitigation: Keep "How to run" note in each benchmark plan and link from docs/benchmarking.md
tests:
  - "docs/benchmarking.md exists and is linked from performance.md"
  - "At least one plan file with benchmark: true exists and imports successfully"
todos:
  - id: benchmark-plans
    content: Add 1-2 fixed-scope benchmark plans with benchmark true and document how to run
    agent: documenter
    intent: |
      Create one or two plan files under plans/ (e.g. plans/benchmark_cli_small.md and optionally plans/benchmark_docs_small.md) with fixed scope (5-8 tasks), known repo state, and frontmatter benchmark: true. Include in each plan a short "How to run" note (import with tg import, run /work or execute tasks, then tg stats --plan <id> and tg stats --timeline --benchmark). Purpose: reproducible baseline for problem-to-solution performance.
    changeType: create
    docs: [plan-format, performance]
  - id: implementer-checklist
    content: Add benchmark-run self-report checklist to implementer and work skill
    agent: documenter
    intent: |
      In .cursor/agents/implementer.md add a short "Benchmark runs" subsection: when the plan is a benchmark (or orchestrator indicates benchmark run), implementer MUST (or SHOULD) pass tg done --tokens-in --tokens-out --tool-calls --attempt when completing tasks so cost and efficiency are comparable. In .cursor/skills/work/SKILL.md add one line or bullet: for benchmark plans, ensure implementer prompt or reminder includes self-report requirement. No code changes.
    changeType: document
    docs: [agent-contract, performance]
  - id: docs-benchmarking-runbook
    content: Add docs/benchmarking.md runbook and link from performance.md
    agent: documenter
    intent: |
      Create docs/benchmarking.md with sections: purpose (reproducible performance baseline), how to run benchmark plans (import, execute, record), how to record results (tg stats --plan, tg stats --timeline --benchmark, evidence), how to interpret (velocity, reviewer pass rate, gate result). Link from docs/performance.md in a "Benchmarking" or "See also" section. Add benchmarking to docs/domains.md if treated as a domain slug for doc assignment.
    changeType: create
    docs: [performance, domains]
  - id: run-full-suite
    content: Run full test suite (pnpm gate:full) and record result in evidence
    agent: implementer
    blockedBy:
      [benchmark-plans, implementer-checklist, docs-benchmarking-runbook]
    intent: |
      Run pnpm gate:full from the plan worktree (or repo root if no worktree). Confirm all tests pass. Document result in tg done evidence (e.g. "gate:full passed" or "gate:full failed: <summary>").
    changeType: test
isProject: false
---

## Analysis

This plan is **Project 4** of the TaskGraph Benchmarking initiative. It delivers the runbook, conventions (implementer checklist), and 1–2 fixed-scope benchmark plan definitions so that benchmark runs are reproducible and self-report is consistent. **Prerequisite:** Project 2 (Benchmark Schema and Import) should be done so that plans with `benchmark: true` get `project.is_benchmark = 1` on import.

## Dependency graph

```
Parallel start:
  ├── benchmark-plans
  ├── implementer-checklist
  └── docs-benchmarking-runbook

After all of the above:
  └── run-full-suite
```

## Original prompt

<original_prompt>
Extracted from Agentic Benchmarking plan for Initiative Project 4 (Benchmark Runbook and Conventions).
</original_prompt>
