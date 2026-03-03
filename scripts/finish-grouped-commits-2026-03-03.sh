#!/usr/bin/env bash
# Finish commit-messages workflow: pop stash, copy group files into worktrees,
# create any missing commits, merge all group branches into main, tag, add to daily initiative, clean up.
# Run from repo root: bash scripts/finish-grouped-commits-2026-03-03.sh

set -e
REPO=/Users/dan/repos/taskgraph
WT="$REPO/../commit-worktrees-2026-03-03"
MAIN_BRANCH="${1:-main}"

cd "$REPO"

# 1) Ensure we're on main; pop stash so we have changes to copy into worktrees
git checkout "$MAIN_BRANCH" 2>/dev/null || true
git stash list | grep -q "commit-messages pre-dispatch" && git stash pop || true

# 2) Copy each group's files from main repo into its worktree (same relative paths)
mkdir -p "$WT/g1/.cursor/agents" "$WT/g1/.cursor" "$WT/g2/docs/leads" "$WT/g3/plans" "$WT/g4/reports"
mkdir -p "$WT/g5/__tests__/domain" "$WT/g5/__tests__/integration"
mkdir -p "$WT/g6/src/agent-context" "$WT/g7/src/cli" "$WT/g8/src/api" "$WT/g9/src/db" "$WT/g10/src/domain" "$WT/g11/src/mcp" "$WT/g12/scripts"
cp .cursor/agents/sitrep-analyst.md "$WT/g1/.cursor/agents/" 2>/dev/null || true
cp .cursor/memory.md "$WT/g1/.cursor/" 2>/dev/null || true
cp README.md "$WT/g2/" 2>/dev/null || true
cp docs/leads/README.md docs/leads/sitrep-breadcrumb.md "$WT/g2/docs/leads/" 2>/dev/null || true
cp docs/mcp.md docs/schema.md docs/agent-hours-query.md "$WT/g2/docs/" 2>/dev/null || true
cp plans/26-03-03_*.md "$WT/g3/plans/" 2>/dev/null || true
cp reports/26-03-03_*.md reports/review-*.md reports/sitrep-*.md "$WT/g4/reports/" 2>/dev/null || true
cp __tests__/domain/token-estimate.test.ts "$WT/g5/__tests__/domain/" 2>/dev/null || true
for f in __tests__/integration/agent-context.test.ts __tests__/integration/agent-stats.test.ts __tests__/integration/blocked-status-materialized.test.ts __tests__/integration/dolt-sync.test.ts __tests__/integration/footprint.test.ts __tests__/integration/global-setup.ts __tests__/integration/initiative.test.ts __tests__/integration/recover.test.ts __tests__/integration/sdk-vs-cli.test.ts __tests__/integration/start-error-cause.test.ts __tests__/integration/stats-benchmark-plain-filter.test.ts __tests__/integration/stats.test.ts __tests__/integration/status-live.test.ts __tests__/integration/test-utils.ts __tests__/integration/worktree.test.ts; do cp "$f" "$WT/g5/$f" 2>/dev/null || true; done
cp src/agent-context/collector.ts src/agent-context/db.ts src/agent-context/events.ts "$WT/g6/src/agent-context/" 2>/dev/null || true
cp src/cli/gate.ts src/cli/plan.ts src/cli/plan-summary.ts src/cli/start.ts src/cli/status.ts "$WT/g7/src/cli/" 2>/dev/null || true
cp src/api/client.ts "$WT/g8/src/api/" 2>/dev/null || true
cp src/db/migrate.ts "$WT/g9/src/db/" 2>/dev/null || true
cp src/domain/blocked-status.ts "$WT/g10/src/domain/" 2>/dev/null || true
cp src/mcp/tools.ts "$WT/g11/src/mcp/" 2>/dev/null || true
cp scripts/query-agent-events.ts "$WT/g12/scripts/" 2>/dev/null || true

# 3) Create any missing commits in each worktree (idempotent: no-op if already committed)
commit_if_clean() {
  local wtdir="$1"
  local msg="$2"
  shift 2
  local files=("$@")
  cd "$wtdir"
  if git diff --quiet && git diff --cached --quiet; then
    : # nothing to commit
  else
    for f in "${files[@]}"; do [ -e "$f" ] && git add "$f"; done
    git diff --cached --quiet || git commit -m "$msg"
  fi
  cd "$REPO"
}

# g1
commit_if_clean "$WT/g1" "chore(cursor): sitrep analyst and memory updates" \
  .cursor/agents/sitrep-analyst.md .cursor/memory.md

# g2
commit_if_clean "$WT/g2" "docs: update README, leads, mcp, schema, agent-hours-query" \
  README.md docs/leads/README.md docs/leads/sitrep-breadcrumb.md docs/mcp.md docs/schema.md docs/agent-hours-query.md

# g3
commit_if_clean "$WT/g3" "chore(plans): add 26-03-03 plans (fix integration tests, ood-act speed, task footprint)" \
  plans/26-03-03_fix-failing-integration-tests.md plans/26-03-03_ood-act-speed-iterations.md plans/26-03-03_task-footprint-fields.md

# g4
commit_if_clean "$WT/g4" "chore(reports): add 26-03-03 reports and sitrep" \
  reports/26-03-03_reprioritise-report.md reports/26-03-03_tg-dolt-architecture-evolution.md reports/review-26-03-03_ood-act-proposal.md reports/sitrep-2026-03-03-1815.md

# g5
commit_if_clean "$WT/g5" "test(integration): integration and domain test updates" \
  __tests__/domain/token-estimate.test.ts \
  __tests__/integration/agent-context.test.ts __tests__/integration/agent-stats.test.ts __tests__/integration/blocked-status-materialized.test.ts \
  __tests__/integration/dolt-sync.test.ts __tests__/integration/footprint.test.ts __tests__/integration/global-setup.ts \
  __tests__/integration/initiative.test.ts __tests__/integration/recover.test.ts __tests__/integration/sdk-vs-cli.test.ts \
  __tests__/integration/start-error-cause.test.ts __tests__/integration/stats-benchmark-plain-filter.test.ts __tests__/integration/stats.test.ts \
  __tests__/integration/status-live.test.ts __tests__/integration/test-utils.ts __tests__/integration/worktree.test.ts

# g6 already committed by sub-agent; ensure no stray changes
(cd "$WT/g6" && git diff --cached --quiet && git diff --quiet || { git add src/agent-context/collector.ts src/agent-context/db.ts src/agent-context/events.ts 2>/dev/null; git diff --cached --quiet || git commit -m "feat(agent-context): collector, db, and events updates"; })

# g7
commit_if_clean "$WT/g7" "feat(cli): updates to gate, plan, plan-summary, start, and status commands" \
  src/cli/gate.ts src/cli/plan.ts src/cli/plan-summary.ts src/cli/start.ts src/cli/status.ts

# g8
commit_if_clean "$WT/g8" "fix(api): api client" src/api/client.ts

# g9
commit_if_clean "$WT/g9" "chore(db): migrate module updates" src/db/migrate.ts

# g10
commit_if_clean "$WT/g10" "refactor(domain): clarify blocked-status types and exports" src/domain/blocked-status.ts

# g11
commit_if_clean "$WT/g11" "feat(mcp): update MCP tools" src/mcp/tools.ts

# g12
commit_if_clean "$WT/g12" "chore(scripts): add query-agent-events script for agent event queries" scripts/query-agent-events.ts

# g13: deletion
(cd "$WT/g13" && rm -f .taskgraph/tg-server.json && git add .taskgraph/tg-server.json 2>/dev/null; git diff --cached --quiet || git commit -m "chore: remove obsolete tg-server.json")

# 4) Merge all group branches into main (in order)
cd "$REPO"
git checkout "$MAIN_BRANCH"
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13; do
  git merge --no-ff chore/grouped-commits-2026-03-03-g$i -m "Merge chore/grouped-commits-2026-03-03-g$i"
done

# 5) Tag
git tag grouped-commits-2026-03-03

# 6) Add bundle to daily initiative
DAILY_ID=$(pnpm tg initiative list --json 2>/dev/null | node -e "
let d; try { d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); } catch(e) { process.exit(1); }
const found = (d.initiatives||[]).find(i => /daily|today/i.test(i.title||'')); console.log(found ? found.id : '00000000-0000-4000-8000-000000000000');
" 2>/dev/null || echo "00000000-0000-4000-8000-000000000000")
PLAN_ID=$(pnpm tg plan new "Grouped commits 2026-03-03: cursor, docs, plans, reports, tests, agent-context, cli, api, db, domain, mcp, scripts, chore" --intent "13 logical commits from commit-messages skill" 2>/dev/null | sed -n 's/.*\([a-f0-9-]\{36\}\).*/\1/p' | head -1)
[ -n "$PLAN_ID" ] && [ "$DAILY_ID" != "00000000-0000-4000-8000-000000000000" ] && pnpm tg initiative assign-project "$DAILY_ID" "$PLAN_ID" 2>/dev/null || true

# 7) Clean-up: remove worktrees, prune, delete worktree dir, delete merged branches (stash was already popped in step 1)
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13; do
  git worktree remove "$WT/g$i" --force 2>/dev/null || true
  git branch -d chore/grouped-commits-2026-03-03-g$i 2>/dev/null || true
done
git worktree prune
rm -rf "$WT"

echo "Done. Branch: $MAIN_BRANCH, tag: grouped-commits-2026-03-03, 13 commits merged."
echo "Daily initiative ID: $DAILY_ID, plan ID: $PLAN_ID"
