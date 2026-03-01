---
name: Benchmark Schema and Import
overview: Add project.is_benchmark column via migration, parser and import support for plan frontmatter benchmark, and tests. Part of the TaskGraph Benchmarking initiative (Project 2). Requires no other projects; run before Benchmark Stats and Recovery and Benchmark Runbook and Conventions.
fileTree: |
  src/
  ├── db/
  │   └── migrate.ts                    (modify)
  ├── cli/
  │   └── import.ts                     (modify)
  ├── plan-import/
  │   └── parser.ts                     (modify)
  docs/
  ├── schema.md                         (modify)
  └── plan-format.md                     (modify)
  __tests__/
  └── (integration or unit)             (create or modify)
risks:
  - description: Migration could fail if project table is in use
    severity: low
    mitigation: Idempotent check for column existence; follow dolt-schema-migration skill
tests:
  - "Migration idempotent; project.is_benchmark default 0"
  - "Import with plan frontmatter benchmark: true sets project.is_benchmark = 1"
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
  - id: add-tests
    content: Add tests for is_benchmark migration and import benchmark
    agent: implementer
    blockedBy: [schema-benchmark, import-benchmark]
    intent: |
      Unit or integration tests: (1) Migration applies and is idempotent; project has is_benchmark default 0. (2) Import with plan frontmatter benchmark: true sets project.is_benchmark = 1. Prefer integration tests in __tests__/integration/ if they touch Dolt and CLI; otherwise unit tests in __tests__/.
    changeType: test
    docs: [testing]
  - id: run-full-suite
    content: Run full test suite (pnpm gate:full) and record result in evidence
    agent: implementer
    blockedBy: [add-tests]
    intent: |
      Run pnpm gate:full from the plan worktree (or repo root if no worktree). Confirm all tests pass. Document result in tg done evidence (e.g. "gate:full passed" or "gate:full failed: <summary>").
    changeType: test
isProject: false
---

## Analysis

This plan is **Project 2** of the TaskGraph Benchmarking initiative. It delivers the foundation: a `project.is_benchmark` column and the ability to set it from plan frontmatter on import. Later projects (Stats and Recovery, Runbook and Conventions) depend on this so that `tg stats --benchmark` and benchmark plan definitions work.

## Dependency graph

```
Parallel start:
  └── schema-benchmark

After schema-benchmark:
  └── import-benchmark

After import-benchmark:
  └── add-tests

After add-tests:
  └── run-full-suite
```

## Original prompt

<original_prompt>
Extracted from Agentic Benchmarking plan for Initiative Project 2 (Benchmark Schema and Import).
</original_prompt>
