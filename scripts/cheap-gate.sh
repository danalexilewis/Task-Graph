#!/usr/bin/env bash
set -euo pipefail

# Progress: print step start and elapsed when done. Usage: step_start N M "Label"; ...; step_done "Label"
step_start() { echo ""; echo "→ [$1/$2] $3 ..."; STEP_BEG=$SECONDS; }
step_done()  { echo "   ✓ $1 done ($((SECONDS - STEP_BEG))s)"; }

FULL=
FILES=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --full)
      FULL=1
      shift
      ;;
    --files)
      shift
      while [[ $# -gt 0 ]] && [[ "$1" != --* ]]; do
        FILES+=("$1")
        shift
      done
      ;;
    *)
      shift
      ;;
  esac
done

if [[ ${#FILES[@]} -eq 0 ]]; then
  CHANGED=$(git diff --name-only HEAD 2>/dev/null || true)
else
  CHANGED=$(printf '%s\n' "${FILES[@]}")
fi

if [[ -n "$FULL" ]]; then
  echo "Cheap gate (full): lint → typecheck → setup → tests (db → mcp → rest) → teardown"
  TOTAL=5
else
  echo "Cheap gate: lint → typecheck → tests (targeted)"
  TOTAL=3
fi

step_start 1 "$TOTAL" "Lint (biome)"
npx @biomejs/biome check src/ __tests__/ scripts/
step_done "Lint"

if [[ -n "$FULL" ]]; then
  step_start 2 "$TOTAL" "Typecheck (full)"
  bash scripts/typecheck.sh --all
else
  step_start 2 "$TOTAL" "Typecheck (changed)"
  bash scripts/typecheck.sh
fi
step_done "Typecheck"

if [[ -n "$FULL" ]]; then
  step_start 3 "$TOTAL" "Integration setup"
  bun run scripts/run-integration-global-setup.ts
  step_done "Integration setup"

  step_start 4 "$TOTAL" "Tests (db → mcp → rest)"
  set +e
  SUB_BEG=$SECONDS
  echo "   → db/"
  bun test __tests__/db/
  DB_EXIT=$?
  echo "   ✓ db ($((SECONDS - SUB_BEG))s)"
  SUB_BEG=$SECONDS
  echo "   → mcp/"
  bun test __tests__/mcp/
  MCP_EXIT=$?
  echo "   ✓ mcp ($((SECONDS - SUB_BEG))s)"
  SUB_BEG=$SECONDS
  echo "   → cli/ domain/ e2e/ export/ integration/ plan-import/ skills/"
  bun test __tests__/cli/ __tests__/domain/ __tests__/e2e/ __tests__/export/ __tests__/integration/ __tests__/plan-import/ __tests__/skills/
  REST_EXIT=$?
  echo "   ✓ rest ($((SECONDS - SUB_BEG))s)"
  EXIT=$((DB_EXIT | MCP_EXIT | REST_EXIT))
  set -e
  step_done "Tests"

  step_start 5 "$TOTAL" "Integration teardown"
  bun run scripts/run-integration-global-teardown.ts
  step_done "Integration teardown"
  echo ""
  echo "Cheap gate (full) passed in ${SECONDS}s."
  exit "$EXIT"
fi

# Targeted gate: tests only
step_start 3 "$TOTAL" "Tests (affected)"
AFFECTED=$(echo "$CHANGED" | bun scripts/affected-tests.ts 2>/dev/null || true)
RAN_INTEGRATION_SETUP=
if [[ -n "$AFFECTED" ]] && echo "$AFFECTED" | grep -q "__tests__/integration"; then
  echo "   → integration setup"
  bun run scripts/run-integration-global-setup.ts
  RAN_INTEGRATION_SETUP=1
fi
if [[ -n "$AFFECTED" ]]; then
  set +e
  echo "$AFFECTED" | xargs bun test
  EXIT=$?
  set -e
  if [[ -n "$RAN_INTEGRATION_SETUP" ]]; then
    echo "   → integration teardown"
    bun run scripts/run-integration-global-teardown.ts
  fi
  step_done "Tests"
  echo ""
  echo "Cheap gate passed in ${SECONDS}s."
  exit "$EXIT"
fi

echo "   No affected tests, skipping."
step_done "Tests"
echo ""
echo "Cheap gate passed in ${SECONDS}s."
