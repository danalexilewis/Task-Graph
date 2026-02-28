---
name: Concurrent Tests Maximize
overview: Enable full concurrent test execution across the suite and add test.serial() for any flaky tests, with documented approach for future flaky identification.
fileTree: |
  bunfig.toml                    (modify)
  package.json                   (modify)
  scripts/
  └── cheap-gate.sh              (modify)
  __tests__/
  └── **/*.test.ts               (modify where flaky)
  .cursor/
  └── memory.md                  (modify)
risks:
  - description: Enabling --concurrent globally could expose order-dependent or shared-state bugs
    severity: medium
    mitigation: Run full suite multiple times; add test.serial() or describe.serial() only where flakiness is observed
  - description: Over-use of test.serial() would reduce concurrency benefit
    severity: low
    mitigation: Add serial only for tests that actually fail under concurrency; document rationale in comment
tests:
  - "Full suite passes with --concurrent (gate:full)"
  - "Flaky tests (if any) are marked test.serial() and documented"
todos:
  - id: enable-full-concurrency
    content: Add --concurrent to test:all and gate:full so whole suite runs concurrently
    agent: implementer
    intent: |
      Maximize test concurrency. Today only __tests__/integration and __tests__/e2e run concurrently (via bunfig.toml concurrentTestGlob). Unit dirs (db, domain, export, plan-import, cli, skills) run sequentially.
      Change 1: In package.json, update the "test:all" script to "bun test __tests__ --concurrent" so the full suite runs with concurrency.
      Change 2: In scripts/cheap-gate.sh, when FULL is set, run "bun test __tests__ --concurrent" instead of "bun test __tests__". Leave targeted/affected test runs unchanged (no --concurrent) so default gate behavior is unchanged.
      Optionally in bunfig.toml: broaden concurrentTestGlob to include all __tests__ (e.g. "**/__tests__/**") so even without the flag all files are concurrent; the --concurrent flag in scripts then makes intent explicit. Prefer script-level --concurrent for full runs so targeted runs stay as-is.
    suggestedChanges: |
      package.json: "test:all": "bun test __tests__ --concurrent"
      cheap-gate.sh line ~42: bun test __tests__ --concurrent
    changeType: modify
  - id: document-flaky-test-approach
    content: Document how to identify flaky tests and when to use test.serial()
    agent: implementer
    intent: |
      Add guidance so future flaky tests under concurrency are handled consistently. Document: (1) How to identify flaky tests (run pnpm gate:full or pnpm test:all multiple times, e.g. 3-5, and note intermittently failing tests). (2) When to use test.serial() or describe.serial() (Bun API) — only for tests that fail under concurrency due to order or shared state. (3) Add a one-line comment at the serial block explaining why (e.g. "Flaky under concurrency; shared Dolt state").
      Place the guidance in .cursor/memory.md under a short "Test concurrency" or "Flaky tests" bullet so agents and humans see it. Keep it under 10 lines.
    changeType: document
  - id: run-flakiness-check-and-add-serial
    content: Run full suite multiple times with concurrency and add test.serial() for any flaky tests
    agent: implementer
    blockedBy: [enable-full-concurrency]
    intent: |
      After enable-full-concurrency is done, run pnpm gate:full (or pnpm test:all) at least 3 times. Record any test or describe that fails intermittently. For each flaky test: wrap it with test.serial() or the describe with describe.serial() (from bun:test), and add a brief comment above the block (e.g. "Serial: flaky under concurrency"). If no flakiness is observed, add a note in task evidence and skip code changes. If flakiness is found, list the files and test names in evidence and update .cursor/memory.md with a one-line note if the cause is non-obvious.
    suggestedChanges: |
      In flaky test file: import { test, describe } from "bun:test"; use test.serial("name", fn) or describe.serial("name", () => { ... })
    changeType: modify
  - id: run-full-suite
    content: Run full test suite and record result in evidence
    agent: implementer
    blockedBy: [run-flakiness-check-and-add-serial]
    intent: |
      Run pnpm gate:full once. Record outcome in task evidence: "gate:full passed" or "gate:full failed: <short summary>". On failure, add tg note with the failure reason and do not mark done until fixed or escalated.
    changeType: test
isProject: false
---

## Analysis

We already run integration and e2e test _files_ concurrently via `concurrentTestGlob` in bunfig.toml. Unit and cli/skills tests run sequentially. To maximize performance we enable concurrency for the entire suite on full runs (test:all and gate:full) and adopt a clear approach for flaky tests: identify via repeated runs, then mark only the minimal set with `test.serial()` so the rest stay concurrent.

Planner-analyst found no cross-file shared state that would make unit-file concurrency unsafe; integration tests already use per-file temp dirs. Risk is limited to order-dependent or hidden shared state, mitigated by running the suite multiple times and adding serial only where needed.

## Dependency graph

```
Parallel start (2 unblocked):
  ├── enable-full-concurrency   (package.json + cheap-gate.sh)
  └── document-flaky-test-approach   (.cursor/memory.md)

After enable-full-concurrency:
  └── run-flakiness-check-and-add-serial   (run gate:full 3–5x, add test.serial() if flaky)

After run-flakiness-check-and-add-serial:
  └── run-full-suite   (final gate:full, evidence)
```

## Proposed changes

- **package.json:** `"test:all": "bun test __tests__ --concurrent"`.
- **cheap-gate.sh:** When `FULL` is set, use `bun test __tests__ --concurrent` instead of `bun test __tests__`.
- **Flaky tests:** Use Bun's `test.serial()` or `describe.serial()` in the specific test file; add a one-line comment. No new files required unless we add a small doc section (memory is sufficient).
- **.cursor/memory.md:** Short bullet under Test concurrency: how to find flaky tests (repeated full runs), when to use test.serial(), and to comment why.

## Open questions

None. Option to broaden `concurrentTestGlob` to `**/__tests__/**` was considered; we chose script-level `--concurrent` for full runs only so targeted/affected runs stay unchanged.

<original_prompt>
/plan make tests run concurrently where ever possible. Also do the optional thing 2 (if any test proves flaky under concurrency, mark it with test.serial() in that file so only that test runs sequentially).
</original_prompt>
