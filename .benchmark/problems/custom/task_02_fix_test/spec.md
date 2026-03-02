# task_02_fix_test Spec

Fix the test so the suite passes. The implementation under test is correct; only the test assertion is wrong.

## Problem

The stub is minimal TypeScript and one test file. The test file contains an **intentional wrong assertion**. The agent must fix the assertion so the test passes.

## Constraints

- Keep the stub minimal: no database, no full taskgraph; only the one source file and one test file.
- Do not change the implementation (e.g. `src/sum.ts`); change only the test.

## Success

`run.sh` runs the stub test suite; after the fix, it exits 0.
