---
name: Custom Benchmark Suite (Option C)
overview: Add the custom minimal productivity suite under .benchmark/problems/custom/ with two canonical tasks (add CLI command, fix failing test), a per-task run.sh, results storage, README, and a runner script. Only .benchmark/results/ is gitignored so canonical problems are committed.
fileTree: |
  .benchmark/
  ├── README.md                        (create)
  ├── problems/
  │   └── custom/
  │       ├── task_01_cli_command/
  │       │   ├── spec.md             (create)
  │       │   ├── run.sh              (create)
  │       │   └── stub/               (create - minimal CLI)
  │       └── task_02_fix_test/
  │           ├── spec.md             (create)
  │           ├── run.sh              (create)
  │           └── stub/               (create - minimal TS + test)
  ├── results/                        (dir; gitignored)
  scripts/
  └── run-benchmark.ts                (create)
  docs/
  └── performance.md                  (modify - add Productivity benchmark link)
risks:
  - description: Stub package (task_01) must stay minimal so run.sh stays fast and deterministic
    severity: low
    mitigation: No Dolt, no full tg; only one subcommand and one test file for task_02
tests:
  - "Runner script exits 0 and writes a result JSON when run (smoke)"
  - "task_01 run.sh passes after agent adds ping; fails before"
  - "task_02 run.sh passes after agent fixes assertion; fails before"
todos:
  - id: benchmark-structure
    content: Create .benchmark structure and README
    agent: documenter
    intent: |
      Add .benchmark/README.md explaining: (1) how to run a benchmark (point agent at a task's spec.md, agent does the work, then run that task's run.sh from repo root or from task dir), (2) how productivity is computed (success = run.sh exit 0, wall-clock time, optional tokens from tg done). Create directories .benchmark/problems/custom/, .benchmark/results/ (empty; results gitignored). No task subdirs yet.
    changeType: create
    docs: [performance]
  - id: task-01-cli
    content: Add task_01_cli_command (spec, self-contained stub, run.sh)
    agent: implementer
    blockedBy: [benchmark-structure]
    intent: |
      Under .benchmark/problems/custom/task_01_cli_command/: (1) spec.md — "Add a `tg ping` subcommand that prints PONG to stdout and exits 0. Optional: --json prints {\"pong\":true}. Implement in stub/." (2) stub/ — minimal Node/TS CLI: package.json (main script), tsconfig.json, src/cli/index.ts that registers one placeholder command (e.g. "ping" that throws or is missing), and src/cli/ping.ts empty or throwing. Agent will add the real ping implementation. (3) run.sh — cd stub, pnpm install, pnpm build (or tsc), node dist/... ping (or equivalent); check exit 0 and stdout contains PONG; exit 0 on success else 1. Use SECONDS or date to capture duration and echo it so a runner can parse it, or keep run.sh exit-only and let runner time it.
    changeType: create
    docs: [cli-reference]
    skill: cli-command-implementation
  - id: task-02-fix-test
    content: Add task_02_fix_test (spec, stub with wrong assertion, run.sh)
    agent: implementer
    blockedBy: [benchmark-structure]
    intent: |
      Under .benchmark/problems/custom/task_02_fix_test/: (1) spec.md — "The test file has a wrong assertion. Fix it so the test passes. The implementation under test is correct." (2) stub/ — minimal Bun project: one source file (e.g. src/sum.ts with sum(a,b) returning a+b) and one test file (e.g. __tests__/sum.test.ts) with a wrong assertion (e.g. expect(sum(1,2)).toBe(4) instead of 3). (3) run.sh — cd stub, bun test; exit with test process exit code; optionally echo duration. No dependency on main repo.
    changeType: create
    docs: [testing]
  - id: runner-script
    content: Add scripts/run-benchmark.ts to run tasks and write results
    agent: implementer
    blockedBy: [task-01-cli, task-02-fix-test]
    intent: |
      Script that: (1) accepts an argument (task name or "all"), (2) for each task runs its run.sh from the task dir (e.g. .benchmark/problems/custom/task_01_cli_command/run.sh) with cwd repo root or task dir as needed, (3) captures exit code and duration, (4) writes .benchmark/results/<iso-timestamp>.json with shape { runs: [ { task_id, pass: boolean, duration_seconds } ], timestamp }. Use Node or Bun; exec or spawn run.sh. Document in .benchmark/README.md how to run (e.g. "bun run scripts/run-benchmark.ts all").
    changeType: create
    docs: [testing]
  - id: docs-link
    content: Link productivity benchmark from docs/performance.md
    agent: documenter
    blockedBy: [benchmark-structure]
    intent: |
      In docs/performance.md add a short "Productivity benchmark" subsection that points to .benchmark/README.md and states that .benchmark/ is gitignored and used for custom productivity runs (Option C). No new domain doc required unless we add benchmarking to domains.md later.
    changeType: modify
    docs: [performance]
  - id: verify-runner
    content: Smoke-test runner and document verification
    agent: implementer
    blockedBy: [runner-script]
    intent: |
      Run scripts/run-benchmark.ts all once; confirm .benchmark/results/ gets a new JSON file and output is sensible. Optionally add a single integration test or script in package.json (e.g. "benchmark:smoke") that runs the runner and asserts results file exists and has expected shape. If test is flaky (e.g. task_01 fails if ping not implemented), document manual verification in README instead and skip automated test.
    changeType: test
    docs: [testing]
isProject: false
---

## Analysis

Option C from reports/agentic-benchmarking-options-2026-03-01.md gives us a well-known, computable problem in an ignored folder so we can measure productivity (success, wall-clock time, optional tokens). We use a **self-contained stub** per task so we don't pollute the main repo and reset is trivial (re-run against the same stub or re-copy).

**Decisions:**

- **task_01:** Minimal CLI in stub/ (package.json, tsc, src/cli with placeholder for ping). Agent adds `ping` that prints PONG. run.sh builds and runs from stub.
- **task_02:** Minimal Bun project in stub/ (sum.ts + test with wrong assertion). Agent fixes assertion. run.sh runs `bun test`.
- **Runner:** One script in `scripts/run-benchmark.ts` so we can run "all" or one task and write results to `.benchmark/results/<timestamp>.json`.
- **No Dolt or full tg** in stubs — keeps run.sh fast and deterministic.

## Dependency graph

```
Parallel start:
  └── benchmark-structure   (README + dirs)

After benchmark-structure:
  ├── task-01-cli          (spec + stub + run.sh)
  ├── task-02-fix-test     (spec + stub + run.sh)
  └── docs-link            (performance.md link)

After task-01-cli and task-02-fix-test:
  └── runner-script        (run-benchmark.ts)

After runner-script:
  └── verify-runner        (smoke / doc)
```

## Open questions

- Whether to add `pnpm benchmark:smoke` or similar to package.json; left to verify-runner task (prefer doc if fragile).

## Original prompt

<original_prompt>
/plan lets start with option C like you said
</original_prompt>
