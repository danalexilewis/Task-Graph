---
name: Agentic Benchmarking (Report Recommendations)
overview: Implement the five recommendations from reports/agentic-performance-benchmarking-2026-03-01.md so we can test the agentic system for performance from problem definition to solution. Includes benchmark flag on project, stats filter, benchmark plan definitions, implementer self-report checklist, investigator fix rate in stats, and benchmarking runbook. Excludes LLM trace integration.
fileTree: |
  src/
  ├── db/
  │   └── migrate.ts                    (modify)
  ├── cli/
  │   ├── import.ts                     (modify)
  │   └── stats.ts                     (modify)
  ├── plan-import/
  │   └── parser.ts                    (modify)
  docs/
  ├── schema.md                        (modify)
  ├── plan-format.md                   (modify)
  ├── performance.md                   (modify)
  ├── cli-reference.md                 (modify)
  └── benchmarking.md                  (create)
  plans/
  └── benchmark_*.md                    (create, 1-2 files)
  .cursor/
  ├── agents/
  │   └── implementer.md               (modify)
  └── skills/
      └── work/
          └── SKILL.md                 (modify)
risks:
  - description: Investigator fix rate relies on heuristic (run-full-suite task by title or last task) and free-text evidence
    severity: low
    mitigation: Document heuristic; accept substring match for first version; refine in follow-up if needed
tests:
  - "Migration idempotent; project.is_benchmark default 0"
  - "Import sets is_benchmark from plan frontmatter benchmark: true"
  - "tg stats --timeline --benchmark returns only benchmark projects"
  - "Integration test or manual run of benchmark plan import and stats filter"
todos:
  - id: schema-benchmark
    content: Add project.is_benchmark column (migration) and update schema.md and plan-format.md
    agent: implementer
    intent: |
      Add a Dolt migration that adds column is_benchmark (TINYINT(1) or BOOLEAN, DEFAULT 0) to project. Idempotent: check column exists before ALTER. Update docs/schema.md project table and docs/plan-format.md plan-level optional fields to document benchmark. No parser or import changes yet.
    changeType: modify
    docs: [schema, plan-format]
    skill: dolt-schema-migration
  - id: import-benchmark
    content: Parser and import set project.is_benchmark from plan frontmatter
    agent: implementer
    blockedBy: [schema-benchmark]
    intent: |
      In plan-import/parser.ts add benchmark?: boolean to CursorFrontmatter and ParsedPlan; in frontmatterToParsedPlan set benchmark from fm.benchmark. In cli/import.ts when creating a new project (insertPayload) or updating (planUpdatePayload), set is_benchmark from parsedPlan.benchmark (1 if true, 0 otherwise). Default omitted = 0. Update docs/plan-format.md and docs/plan-import.md if they list frontmatter fields.
    changeType: modify
    docs: [plan-format, plan-import, schema]
  - id: stats-benchmark-filter
    content: Add tg stats --benchmark filter for timeline and plan view
    agent: implementer
    blockedBy: [schema-benchmark]
    intent: |
      In src/cli/stats.ts add option --benchmark. When --timeline is used and --benchmark is set, add AND p.is_benchmark = 1 to the timeline SQL (FROM project p ... GROUP BY ...). When --plan <id> is used and --benchmark is set, require the selected plan to have is_benchmark = 1 (otherwise no data or clear message). Update docs/cli-reference.md and docs/performance.md for the new flag.
    changeType: modify
    docs: [performance, cli-reference]
    skill: cli-command-implementation
  - id: benchmark-plans
    content: Add 1-2 fixed-scope benchmark plans with benchmark true and document how to run
    agent: documenter
    blockedBy: [import-benchmark]
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
  - id: investigator-fix-rate
    content: Add investigator fix rate to tg stats (query and display)
    agent: implementer
    intent: |
      Derive from events: per project, identify the run-full-suite task (heuristic: task title containing "run full suite" or "run-full-suite" or "gate:full", or last task by dependency order). For that task, get done events ordered by created_at. If any done has evidence containing "gate:full failed", count as had_failure; if a later done has evidence containing "gate:full passed", count as fixed. Investigator fix rate = plans with fixed / plans with had_failure (or show both counts). Add a "Recovery" block to default tg stats output (or a --recovery flag) and document in docs/performance.md and docs/cli-reference.md.
    changeType: modify
    docs: [performance, schema, cli-reference]
    skill: cli-command-implementation
  - id: docs-benchmarking-runbook
    content: Add docs/benchmarking.md runbook and link from performance.md
    agent: documenter
    intent: |
      Create docs/benchmarking.md with sections: purpose (reproducible performance baseline), how to run benchmark plans (import, execute, record), how to record results (tg stats --plan, tg stats --timeline --benchmark, evidence), how to interpret (velocity, reviewer pass rate, gate result). Link from docs/performance.md in a "Benchmarking" or "See also" section. Add benchmarking to docs/domains.md if treated as a domain slug for doc assignment.
    changeType: create
    docs: [performance, domains]
  - id: add-tests
    content: Add tests for is_benchmark migration, import benchmark, and stats --benchmark filter
    agent: implementer
    blockedBy: [schema-benchmark, import-benchmark, stats-benchmark-filter]
    intent: |
      Unit or integration tests: (1) Migration applies and is idempotent; project has is_benchmark default 0. (2) Import with plan frontmatter benchmark: true sets project.is_benchmark = 1. (3) tg stats --timeline --benchmark returns only projects where is_benchmark = 1. Prefer integration tests in __tests__/integration/ if they touch Dolt and CLI; otherwise unit tests in __tests__/.
    changeType: test
    docs: [testing]
  - id: run-full-suite
    content: Run full test suite (pnpm gate:full) and record result in evidence
    agent: implementer
    blockedBy:
      [
        add-tests,
        benchmark-plans,
        implementer-checklist,
        investigator-fix-rate,
        docs-benchmarking-runbook,
      ]
    intent: |
      Run pnpm gate:full from the plan worktree (or repo root if no worktree). Confirm all tests pass. Document result in tg done evidence (e.g. "gate:full passed" or "gate:full failed: <summary>").
    changeType: test
isProject: false
---

## Analysis

The report _reports/agentic-performance-benchmarking-2026-03-01.md_ recommends five concrete steps to test our agentic system for performance from problem definition to solution. We already have the right observables (events, `tg stats`, gate evidence); this plan adds a benchmark tag, filtering, standardized self-report for benchmark runs, investigator fix rate, and a runbook so humans and agents can run and interpret benchmarks consistently.

**Decisions:**

- **Benchmark storage:** New column `project.is_benchmark` (not a JSON tags array) for simplicity and clear filtering in SQL.
- **Investigator fix rate:** Inferred from existing done events and evidence text; no new event kind. Heuristic for "gate task" per plan is documented and acceptable for v1.
- **LLM trace integration:** Explicitly out of scope (high effort, Cursor/API limits).

**Existing data used:** Plan duration, velocity, per-task elapsed, review pass/fail, and self-reported tokens already come from the event table; we only add a filter and one new derived metric (investigator fix rate).

## Dependency graph

```
Parallel start (4 unblocked):
  ├── schema-benchmark      (migration + schema/plan-format docs)
  ├── implementer-checklist (implementer.md + work SKILL)
  ├── investigator-fix-rate (stats recovery block)
  └── docs-benchmarking-runbook (benchmarking.md + performance link)

After schema-benchmark:
  ├── import-benchmark      (parser + import set is_benchmark)
  └── stats-benchmark-filter (tg stats --benchmark)

After import-benchmark:
  └── benchmark-plans       (1-2 plan files with benchmark: true)

After schema-benchmark, import-benchmark, stats-benchmark-filter:
  └── add-tests             (tests for migration, import, stats)

After add-tests, benchmark-plans, implementer-checklist, investigator-fix-rate, docs-benchmarking-runbook:
  └── run-full-suite        (gate:full, evidence)
```

## Proposed changes

- **Migration:** One new migration in `src/db/migrate.ts`: check for `project.is_benchmark` column (information_schema or try SELECT), then `ALTER TABLE project ADD COLUMN is_benchmark TINYINT(1) NOT NULL DEFAULT 0`.
- **Parser:** `CursorFrontmatter` and `ParsedPlan` gain optional `benchmark?: boolean`; `frontmatterToParsedPlan` returns `benchmark: fm.benchmark ?? undefined` (or false if we want explicit default).
- **Import:** On insert and update of project, set `is_benchmark: parsedPlan.benchmark === true ? 1 : 0` (or omit when undefined to leave default).
- **Stats:** `--benchmark` option; timeline SQL gets `AND p.is_benchmark = 1` when flag set; plan view can require `is_benchmark = 1` when `--benchmark` is set.
- **Investigator fix rate:** New SQL or in-memory pass over projects and events to compute "had_failure" and "fixed" counts; append a short "Recovery" section to default stats output.

## Open questions

- Whether to add `--benchmark` to the default (no-flag) timeline: we do not; default remains all projects so existing behavior is unchanged.

## Original prompt

<original_prompt>
/plan based on the report and recommendation
</original_prompt>
