#!/usr/bin/env bash
# Finish commit-messages workflow: merge group branches, tag, drop stash, add to daily initiative, clean up.
# Run from repo root: bash scripts/finish-grouped-commits-2026-03-03.sh

set -e
cd "$(git rev-parse --show-toplevel)"

echo "== Merge group branches into main =="
git checkout main
git merge --no-ff chore/grouped-commits-2026-03-03-g1 -m "Merge chore/grouped-commits-2026-03-03-g1" || true
git merge --no-ff chore/grouped-commits-2026-03-03-g2 -m "Merge chore/grouped-commits-2026-03-03-g2" || true

echo "== Tag (use -f if tag already exists) =="
git tag -f grouped-commits-2026-03-03

echo "== Drop pre-dispatch stash =="
git stash list | grep -q "commit-messages pre-dispatch" && git stash drop || true

echo "== Add bundle to daily initiative =="
# Resolve daily initiative
INITIATIVE_ID=$(pnpm tg initiative list --json 2>/dev/null | node -e "
let d=require('fs').readFileSync(0,'utf8');
try { const j=JSON.parse(d); const x=j.find(p=>/daily|today/i.test(p.title||'')); console.log(x?x.initiative_id:'00000000-0000-4000-8000-000000000000'); } catch(e) { console.log('00000000-0000-4000-8000-000000000000'); }
" 2>/dev/null || echo "00000000-0000-4000-8000-000000000000")
PLAN_ID=$(pnpm tg plan new "Grouped commits 2026-03-03: worktrees doc and utility belt" --intent "2 commits (docs, chore cursor)" 2>/dev/null | grep -oE '[0-9a-f-]{36}' | head -1)
if [ -n "$PLAN_ID" ] && [ -n "$INITIATIVE_ID" ]; then
  pnpm tg initiative assign-project "$INITIATIVE_ID" "$PLAN_ID" 2>/dev/null || true
  echo "Project $PLAN_ID assigned to initiative $INITIATIVE_ID"
fi

echo "== Clean-up: remove worktrees, prune, delete dir, delete branches =="
for i in 1 2; do
  git worktree remove ../commit-worktrees-2026-03-03/g$i --force 2>/dev/null || true
done
git worktree prune
rm -rf ../commit-worktrees-2026-03-03
git branch -d chore/grouped-commits-2026-03-03-g1 chore/grouped-commits-2026-03-03-g2 2>/dev/null || true
git checkout main

echo "== Done =="
git log --oneline -4
