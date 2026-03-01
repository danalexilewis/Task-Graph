---
name: TaskGraph Benchmarking Initiative
overview: Create the TaskGraph Benchmarking initiative and four projects for the first benchmarking version. This plan creates the initiative, documents the 4-project structure and assign-project steps, and adds three new plan files (P2-P4). Project 1 uses the existing Custom Benchmark Suite plan.
fileTree: |
  docs/
  └── benchmarking-initiative.md          (create)
  plans/
  ├── 26-03-01_benchmark_schema_and_import.md    (create)
  ├── 26-03-01_benchmark_stats_and_recovery.md   (create)
  └── 26-03-01_benchmark_runbook_and_conventions.md (create)
risks:
  - description: Parser/import do not yet set initiative_id from frontmatter; linking is manual via assign-project
    severity: low
    mitigation: Document assign-project steps in benchmarking-initiative.md; optional follow-up to add initiative to parser and import
  - description: Four projects share schema and CLI surface; execution order matters (P2 before P3/P4 for is_benchmark)
    severity: low
    mitigation: Document execution order in initiative doc; P1 and P2 can run first, then P3, then P4
tests:
  - "Initiative doc exists and lists 4 projects with plan file names and assign-project steps"
  - "Three new plan files import successfully with tg import --format cursor"
todos:
  - id: create-initiative-and-doc
    content: Create TaskGraph Benchmarking initiative and document 4-project structure
    agent: documenter
    intent: |
      (1) Create the initiative: run `tg initiative new "TaskGraph Benchmarking"` (optionally with --cycle if a cycle exists). Capture the initiative_id from output or `tg initiative list --json`. (2) Create docs/benchmarking-initiative.md with: purpose of the initiative; table of the 4 projects (Name, Plan file, Scope, Execution order); step-by-step "How to run" — import each plan with `tg import plans/<file> --plan "<Name>" --format cursor`, then run `tg initiative assign-project <initiativeId> <planId>` for each project (planId from import output or tg status --projects --json); recommended execution order (Project 1 Custom Suite first, then P2 Schema and Import, then P3 Stats and Recovery, then P4 Runbook and Conventions). Link from docs/performance.md to this doc. No code changes to parser or import.
    changeType: create
    docs: [performance]
  - id: create-plan-schema-import
    content: Create plan file for Project 2 (Benchmark Schema and Import)
    agent: documenter
    intent: |
      Create plans/26-03-01_benchmark_schema_and_import.md by extracting from plans/26-03-01_agentic_benchmarking.md: todos schema-benchmark, import-benchmark, and add-tests (only the tests that cover migration and import). Include frontmatter name, overview, fileTree, risks, tests, and full intent/blockedBy for each todo. Add run-full-suite task blocked by add-tests. This plan becomes "Project 2" when imported; scope is project.is_benchmark migration, parser and import setting is_benchmark from plan frontmatter benchmark, and tests.
    changeType: create
    docs: [schema, plan-format]
  - id: create-plan-stats-recovery
    content: Create plan file for Project 3 (Benchmark Stats and Recovery)
    agent: documenter
    intent: |
      Create plans/26-03-01_benchmark_stats_and_recovery.md by extracting from plans/26-03-01_agentic_benchmarking.md: todos stats-benchmark-filter, investigator-fix-rate, and add-tests (only the tests that cover stats --benchmark filter). Include frontmatter and run-full-suite task. This plan depends on Project 2 being done (is_benchmark column exists); document that in the plan body. This plan becomes "Project 3" when imported.
    changeType: create
    docs: [performance, cli-reference]
  - id: create-plan-runbook-conventions
    content: Create plan file for Project 4 (Benchmark Runbook and Conventions)
    agent: documenter
    intent: |
      Create plans/26-03-01_benchmark_runbook_and_conventions.md by extracting from plans/26-03-01_agentic_benchmarking.md: todos benchmark-plans, implementer-checklist, docs-benchmarking-runbook, run-full-suite. Include full frontmatter and dependency graph. This plan becomes "Project 4" when imported; scope is benchmark plan definitions, implementer/work checklist, docs/benchmarking.md runbook, and final gate. Depends on Project 2 (benchmark: true on import) and optionally Project 3.
    changeType: create
    docs: [plan-format, performance, agent-contract]
  - id: run-full-suite
    content: Run full test suite (pnpm gate:full) and record result in evidence
    agent: implementer
    blockedBy:
      [
        create-initiative-and-doc,
        create-plan-schema-import,
        create-plan-stats-recovery,
        create-plan-runbook-conventions,
      ]
    intent: |
      Run pnpm gate:full from repo root. Confirm all tests pass. Document result in tg done evidence (e.g. "gate:full passed" or "gate:full failed: <summary>").
    changeType: test
isProject: false
---

# TaskGraph Benchmarking Initiative

## Analysis

The session report ([reports/benchmarking-initiative-session-2026-03-01.md](../reports/benchmarking-initiative-session-2026-03-01.md)) and options report ([reports/agentic-benchmarking-options-2026-03-01.md](../reports/agentic-benchmarking-options-2026-03-01.md)) establish: (1) start with **Option C** (custom minimal suite in `.benchmark/`) then implement the agentic benchmarking recommendations; (2) only `.benchmark/results/` is gitignored so canonical problems stay in repo; (3) investigator fix rate and self-report (tokens, attempt) are derived from existing events and evidence. Two plans already exist — [Custom Benchmark Suite](26-03-01_custom_benchmark_suite.md) and [Agentic Benchmarking](26-03-01_agentic_benchmarking.md) — but were not executed. This initiative plan creates the **first initiative** and structures delivery as **four projects** so each project is one importable plan and all can be assigned to the same initiative via `tg initiative assign-project`.

**Why four projects:** (1) **Custom Benchmark Suite** — Option C as one standalone project (existing plan). (2) **Benchmark Schema and Import** — foundation: `project.is_benchmark`, parser and import. (3) **Benchmark Stats and Recovery** — `tg stats --benchmark`, investigator fix rate, tests. (4) **Benchmark Runbook and Conventions** — benchmark plan definitions, implementer checklist, `docs/benchmarking.md`, run-full-suite. Splitting the single Agentic Benchmarking plan into P2–P4 keeps each project coherent and allows parallel execution where dependencies allow (P1 and P2 first; P3 after P2; P4 after P2 and P3).

**Linking projects to the initiative:** The task graph supports one initiative and many projects. After creating the initiative with `tg initiative new "TaskGraph Benchmarking"`, import each of the four plans; each import creates one project. Then run `tg initiative assign-project <initiativeId> <planId>` for each project (planId is the project row id from import or `tg status --projects --json`). Parser/import do not yet set `initiative_id` from plan frontmatter; that is an optional follow-up.

## The four projects

| #   | Project name                      | Plan file                                             | Scope                                                                                                                       |
| --- | --------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Custom Benchmark Suite            | `plans/26-03-01_custom_benchmark_suite.md`            | Option C: `.benchmark/` layout, task_01 (CLI ping), task_02 (fix test), runner script, README, docs link, verify.           |
| 2   | Benchmark Schema and Import       | `plans/26-03-01_benchmark_schema_and_import.md`       | `project.is_benchmark` migration; parser + import set `is_benchmark` from plan frontmatter; schema/plan-format docs; tests. |
| 3   | Benchmark Stats and Recovery      | `plans/26-03-01_benchmark_stats_and_recovery.md`      | `tg stats --benchmark` filter; investigator fix rate in stats; tests for stats.                                             |
| 4   | Benchmark Runbook and Conventions | `plans/26-03-01_benchmark_runbook_and_conventions.md` | 1–2 benchmark plan definitions; implementer checklist + work skill; `docs/benchmarking.md` runbook; run-full-suite.         |

**Execution order:** Run Project 1 (Custom Benchmark Suite) first. Then Project 2 (Schema and Import). Projects 3 and 4 can run after P2; P4 (runbook and gate) should run last so benchmark plans and runbook are in place before the final gate.

## Dependency graph

```
Parallel start (4 unblocked):
  ├── create-initiative-and-doc
  ├── create-plan-schema-import
  ├── create-plan-stats-recovery
  └── create-plan-runbook-conventions

After all of the above:
  └── run-full-suite
```

## How to run the initiative (after this plan is done)

1. Create the initiative (if not already): `tg initiative new "TaskGraph Benchmarking"` (or with `--cycle <cycleId>` if you use cycles). Note the initiative_id.
2. Import each of the four plans and assign to the initiative:
   - `tg import plans/26-03-01_custom_benchmark_suite.md --plan "Custom Benchmark Suite (Option C)" --format cursor`
   - `tg initiative assign-project <initiativeId> <planId>` (planId from import output or `tg status --projects --json`)
   - Repeat for the other three plan files (P2, P3, P4) with their plan names.
3. Execute projects in order: run Project 1 tasks (e.g. via /work or tg next), then Project 2, then P3, then P4. Or run P1 and P2 in parallel, then P3, then P4.

## Open questions

- Whether to add `initiative` to the plan parser and `tg import --initiative` so future plans self-assign on import (deferred; assign-project is sufficient for v1).

## Original prompt

<original_prompt>
/plan to create our first initiative with multiple projects and tasks. Please review the report here @reports/benchmarking-initiative-session-2026-03-01.md and write me a plan for creating an initiative to start benchmarking TaskGraph and breakdown 4 projects to deliver the first version of this feature
</original_prompt>
