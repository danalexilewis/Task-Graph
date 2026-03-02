#!/usr/bin/env bash
# run-task-02.sh - Build and run the task_02_fix_test test stub
set -e

# Build the project
pnpm build

# Run the specific test
bun test __tests__/cli/task-02-fix-test.test.ts
