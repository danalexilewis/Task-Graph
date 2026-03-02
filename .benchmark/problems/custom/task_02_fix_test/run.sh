#!/usr/bin/env bash
# Run task_02_fix_test: run stub tests (stub has wrong assertion; agent fixes it, then this passes)
set -e
cd "$(dirname "$0")/stub"
bun test
