#!/usr/bin/env bash
# run.sh - Build and run the task-01-cli-command stub
set -e

# Build the project
pnpm build

# Execute the command with passed arguments
tg task-01-cli-command "$@"
