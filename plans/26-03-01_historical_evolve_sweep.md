---
name: Historical Evolve Sweep
overview: Run /evolve across all historical project cohorts to mine anti-patterns from the full git history and propagate learnings to agent templates and the field guide.
fileTree: |
  .cursor/agents/
  ├── implementer.md        (modify - append learnings)
  ├── quality-reviewer.md   (modify - append learnings)
  ├── fixer.md              (modify - append learnings)
  └── debugger.md           (modify - append learnings)
  docs/
  └── agent-field-guide.md  (modify - append anti-patterns)
risks:
  - description: Mega-commits (37cee9c, 593deaa) mix many plan-domains into one diff, making plan attribution impossible
    severity: medium
    mitigation: Scope reviewer to src/cli/, src/db/, src/domain/, src/mcp/, .cursor/agents/ — explicitly exclude src/template/. Work at file-level not plan-level.
  - description: No reviewer-FAIL notes for pre-Mar-1 cohorts means lower fixup signal; reviewer must infer anti-patterns from code structure
    severity: low
    mitigation: Instruct reviewer to compare against patterns in docs/agent-field-guide.md and existing Learnings sections as the quality baseline.
  - description: Parallel writes to the same Learnings sections could cause conflicts if tasks run concurrently
    severity: low
    mitigation: Each task reads current Learnings state before writing; evolve skill dedup logic handles keyword-match skipping.
tests:
  - "After each cohort task: implementer.md ## Learnings grows by at least 1 entry OR reviewer reports no new patterns found"
todos:
  - id: evolve-cohort-1
    content: "Evolve cohort 1 - Bootstrap/Foundation era: SQL builder, neverthrow, CLI handler patterns"
    agent: implementer
    skill: evolve
    changeType: modify
    intent: |
      Run the /evolve skill for the Bootstrap/Foundation cohort (git range db77ba3..b7739b9, Feb 25 18:53 – Feb 26 12:59). This covers the initial creation of the entire src/ — SQL query builder, neverthrow Result types, CLI handlers, plan-import, and MCP server.

      This cohort predates plan branches and TG task-commit convention. Use the date-range fallback:

      Step 1 — Get the diff:
        git diff db77ba3..b7739b9 -- src/cli/ src/db/ src/domain/ src/plan-import/ src/mcp/ .cursor/agents/
        git diff --stat db77ba3..b7739b9 -- src/cli/ src/db/ src/domain/ src/plan-import/ src/mcp/ .cursor/agents/

      Step 2 — Dispatch reviewer in research mode (omit model — inherit session model):
        Directive: "Analyse this diff from the Bootstrap/Foundation era of the Task-Graph codebase (git db77ba3..b7739b9, Feb 25-26 2026). All changes are additions — there is no prior state to compare against. Assess first-draft code quality in src/db/query.ts (SQL builder) and the CLI handler pattern in src/cli/*.ts against the patterns documented in docs/agent-field-guide.md. For each file: identify patterns that look like first-draft approximations that a more experienced author would have done differently (SQL template literals, missing Result wrapping, unsafe type assertions, missing tableExists guards, error swallowing). Classify each as: SQL pattern | Type pattern | Error handling | Other. Suggest a one-line agent directive for each. If no anti-patterns are found, say so explicitly."
        Include: git diff output (stat + full patch, scoped to non-template src/ and .cursor/agents/)
        Exclude: src/template/ entirely

      Step 3 — Route learnings (per evolve skill Step 4):
        SQL pattern → implementer.md AND quality-reviewer.md ## Learnings
        Type pattern → implementer.md ## Learnings
        Error handling → quality-reviewer.md ## Learnings
        Structural (3+ occurrences) → docs/agent-field-guide.md Common Mistakes section

      Step 4 — Before writing: scan existing ## Learnings in each file for keyword match — do not duplicate.

      Projects covered: Task Graph Implementation, Thin SQL Query Builder, Fix Neverthrow TypeScript Errors, Docs Tests Neverthrow, Cursor Plan Import and Agent Workflow, Post-Execution Reporting
    suggestedChanges: |
      Key files to focus on:
      - src/db/query.ts (SQL builder — was this the first draft? look for raw SQL template literals in early callers)
      - src/cli/done.ts, start.ts, cancel.ts, next.ts (CLI handler pattern — Result boundary placement)
      - src/plan-import/importer.ts (error handling pattern)
      - src/domain/errors.ts (AppError type — was it used consistently from day 1?)

  - id: evolve-cohort-2
    content: "Evolve cohort 2 - Sub-agent specialisation + batch CLI: multi-ID patterns, DB connection fixes"
    agent: implementer
    skill: evolve
    changeType: modify
    intent: |
      Run the /evolve skill for the Sub-Agent Specialisation & Batch CLI cohort (git range b7739b9..37cee9c, Feb 26 12:59 – Feb 28 14:57, excluding the 37cee9c commit itself). This covers batch CLI operations, sub-agent framework, DB connection read-only bug fix, agent rules evolution.

      Date-range fallback:

      Step 1 — Get the diff:
        git diff b7739b9..37cee9c~ -- src/cli/ src/db/ src/domain/ src/plan-import/ src/mcp/ .cursor/agents/
        # Note: 37cee9c~ means parent of 37cee9c, so we exclude the mega biome commit itself
        git diff --stat b7739b9..37cee9c~ -- src/cli/ src/db/ src/domain/ src/plan-import/ src/mcp/ .cursor/agents/

      Key signals in this cohort:
      - Commit bb59c16 "restore the db and fix read only error" — concrete bug→fix
      - Commit 736ff88 "add batch operation support for the cli" — multi-ID loop pattern
      - Commit d832cf6 "update agent rules" — touched cancel, index, init, next, status, db/connection, migrate, importer in one pass (systematic sweep)

      Step 2 — Dispatch reviewer in research mode:
        Directive: "Analyse this diff from the Sub-Agent Specialisation and Batch CLI era (git b7739b9..37cee9c~). Focus on: (1) The commit bb59c16 ('restore the db and fix read only error') — what was wrong before and what is the correct pattern? (2) The batch-loop pattern in src/cli/cancel.ts, done.ts, note.ts, start.ts — does it accumulate errors or early-return? Which is the better pattern? (3) Commit d832cf6 touched 6+ CLI files in one pass — what inconsistencies was it fixing? Classify findings as: SQL pattern | Type pattern | Error handling | Scope drift | Other. Suggest one-line agent directives."
        Include: git diff output + key commit patches (bb59c16, 736ff88, d832cf6)

      Step 3 — Route learnings per evolve skill Step 4.

      Projects covered: Batch CLI operations, Cursor Sub-Agent Specialization System, Plan Import Robustness, Sharpen Orchestrator Compliance, Restructure Package, TaskGraph MCP Server, External Gates, Dolt Branch Per Agent, Agent field and domain-to-docs rename

  - id: evolve-cohort-3
    content: "Evolve cohort 3 - Biome migration + Feb 28 consolidation: status/TUI layout, reviewer agent structure"
    agent: implementer
    skill: evolve
    changeType: modify
    blockedBy: [evolve-cohort-1]
    intent: |
      Run the /evolve skill for the Biome Migration / Feb 28 Consolidation cohort (git range 37cee9c..593deaa, Feb 28 14:57 – Mar 1 04:38, excluding 593deaa itself). This is the era where biome linter was introduced, spec-reviewer and quality-reviewer agents were created, work/investigate/plan skills were written.

      WARNING: 37cee9c is a mega-commit (89 files). It mixes linter reformatting with feature code. Instruct the reviewer to IGNORE pure formatting changes — focus only on structural/logic changes.

      Date-range fallback:

      Step 1 — Get the diff:
        git diff 37cee9c..593deaa~ -- src/cli/ src/db/ src/domain/ src/mcp/ .cursor/agents/
        # Note: 593deaa~ excludes the stable-rebuild mega-commit
        git diff --stat 37cee9c..593deaa~ -- src/cli/ src/db/ src/domain/ src/mcp/ .cursor/agents/

      Also run separately for the follow-up cleanup commit:
        git show --patch f2e68e9 -- src/cli/status.ts src/cli/table.ts
        # f2e68e9 "tidy up tg status columns" directly follows 37cee9c and is a fixup signal

      Step 2 — Dispatch reviewer in research mode:
        Directive: "Analyse this diff from the Biome Migration and Feb 28 Consolidation era (git 37cee9c..593deaa~). IMPORTANT: ignore all pure whitespace/formatting changes from the biome linter migration — focus only on structural logic changes. Key signals: (1) The f2e68e9 commit ('tidy up tg status columns') directly follows the mega-commit — what layout/rendering mistake did it fix? (2) The spec-reviewer, quality-reviewer, and investigator agents were created here alongside the work/investigate/plan skills — do they have any internal contradictions or inconsistencies with the implementer.md template? (3) src/cli/status.ts: what was the pattern for the table layout? Was it consistent? Classify findings."
        Include: diff output + git show of f2e68e9 + git show of any follow-up status.ts commits

      Step 3 — Route learnings per evolve skill Step 4.

      Projects covered: Migrate to Bun Test/Add Biome, Two-Stage Review, Status Live TUI, Orchestration UI, Agent and Leads Documentation, Short Hash Task IDs, Materialized Blocked Status, Status Dashboard, Context Budget, Implementer No Tests, Integration Test Next Output Docs, Persistent Agent Stats

  - id: evolve-cohort-4
    content: "Evolve cohort 4 - Stable rebuild + worktree arc: start/done/cancel worktree patterns"
    agent: implementer
    skill: evolve
    changeType: modify
    blockedBy: [evolve-cohort-2]
    intent: |
      Run the /evolve skill for the Stable Rebuild / Worktree Integration cohort (git range 593deaa..247d96c, Mar 1 04:38 – 09:20). This covers the 176-file stable rebuild mega-commit, followed by the worktree arc (three focused commits).

      Date-range fallback:

      Step 1 — Get the diff, but focus on the worktree arc (cleanest signal):
        # Full cohort diff (for context):
        git diff 593deaa..247d96c -- src/cli/ src/db/ src/domain/ .cursor/agents/
        # Worktree arc only (highest signal — 3 commits, focused feature):
        git diff 75b1bdc..247d96c -- src/cli/start.ts src/cli/done.ts src/cli/cancel.ts src/cli/worktree.ts src/db/commit.ts src/db/connection.ts
        git show --patch 75b1bdc 805d530 247d96c

      Note: 593deaa (176 files) is mostly src/template/ additions. Skip src/template/ entirely.

      Step 2 — Dispatch reviewer in research mode:
        Directive: "Analyse the worktree arc from the Stable Rebuild era (commits 75b1bdc, 805d530, 247d96c, Mar 1 04:38-09:20). These three commits implement per-task git worktree lifecycle across start.ts, done.ts, cancel.ts. Focus on: (1) Were there any raw SQL template literals for the plan_worktree INSERT — if so, note it but do NOT write a duplicate learning (it is already in implementer.md as [2026-03-01] SQL builder rule). (2) Were there type assertion patterns (as any, non-null assertions) in the worktree path that could fail at runtime? (3) Was error handling consistent across the three worktree CLI commands — did one handle errors the others don't? Classify and suggest directives."
        Also briefly examine the 593deaa mega-commit diff for .cursor/agents/ only (template files for agents).

      Step 3 — Route learnings per evolve skill Step 4.

      Projects covered: Sub-Agent Profiles and Systematic Debugging, Standardize Skills as Agentic Leads, Fix Failing Unit Tests, Fix Skill Name Consolidation, Worktrunk Integration (first half), Integration Test Performance and Harness

  - id: evolve-cohort-5
    content: "Evolve cohort 5 - Multi-plan execution era: cycle/initiative patterns, task(tg-xxx) commits, context trimming"
    agent: implementer
    skill: evolve
    changeType: modify
    blockedBy: [evolve-cohort-3, evolve-cohort-4]
    intent: |
      Run the /evolve skill for the Multi-Plan Execution / Strategic Cycle cohort (git range 247d96c..3b5c0cd, Mar 1 09:20 – 14:15). This is the highest-fidelity cohort — it contains the four task(tg-xxx) tagged commits and a deliberate "review git flow of tasks and reflect on successful coding patterns" commit.

      Date-range fallback (with task-commit enhancement):

      Step 1 — Get the diff:
        git diff 247d96c..3b5c0cd -- src/cli/ src/db/ src/domain/ src/mcp/ .cursor/agents/
        git diff --stat 247d96c..3b5c0cd -- src/cli/ src/db/ src/domain/ src/mcp/ .cursor/agents/

      Also get individual task commits (highest-fidelity signal):
        git show --patch ec85af0  # task(tg-d46bfc): trim tg context output
        git show --patch 6b77f06  # task(tg-a5105d): document tg done self-report flags
        git show --patch f0007f3  # task(tg-0a486d): add integration tests for tg stats
        git show --patch b7bb93f  # task(tg-ec97aa): add stale doing-task warning

      Also get the explicit pattern-review commit:
        git show --patch 3b5c0cd  # "review git flow of tasks and reflect on successful coding patterns"

      Step 2 — Dispatch reviewer in research mode:
        Directive: "Analyse these diffs from the Multi-Plan Execution era (git 247d96c..3b5c0cd, Mar 1 2026). The four task(tg-xxx) commits are the highest-fidelity signal — examine them first. Also examine 6a5d571 + 4c5cda9 (cycle.ts and initiative.ts — clean 2-commit feature arc for the Strategic Cycle domain) and 3b5c0cd (the explicit pattern-reflection commit). Focus on: (1) What patterns did 3b5c0cd change or reinforce — this is the author's own anti-pattern list, find it in the diff. (2) The cycle/initiative commands (src/cli/cycle.ts, src/cli/initiative.ts) — do they follow the same CLI checklist patterns as established CLI commands? Any deviations? (3) Context trimming in ec85af0 (src/cli/context.ts) — what was removed and why? Extract a rule about context scope. Classify all findings."
        Include: all patches listed above

      Step 3 — Route learnings per evolve skill Step 4.

      Projects covered: Strategic Cycle and Initiatives, Docs Formalization (DDD), Import pre-flight and duplicate prevention, Worktrunk Integration (completion), README Upgrade, Persistent Agent Stats, Git Worktree Isolation, Dolt Replication, Meta-Planning Skills, Tactical Escalation Ladder, Dashboard, Status Table Narrow, Merge Status Active Work
isProject: false
---

## Analysis

The repo is exactly 5 days old (Feb 25 – Mar 1 2026). All 55 TG projects fit within this window. The `/evolve` skill was designed for plan branches but all historical branches are already merged. This plan uses **date-range git diffs** as the fallback mechanism — `git diff <start>..<end> -- src/cli/ src/db/ ...` — and passes them to a reviewer in research mode.

**Why 5 cohorts and not 55 tasks:** Most projects were executed in parallel in large batches during 3-4 hour sessions. Commits are not tagged per-project (before Mar 1 12:00). Splitting by project would require guessing which files belong to which project — the reviewer would get misleading scope. Cohort-level diffs are larger but the reviewer can infer which files map to which project-type naturally.

**Two mega-commits are the main noise source:**

- `37cee9c` (89 files, Feb 28): biome migration + all Feb 28 plans landing simultaneously
- `593deaa` (176 files, Mar 1 04:38): stable rebuild + all template files

Both are handled by scoping the diff to `src/cli/ src/db/ src/domain/ src/mcp/ .cursor/agents/` and explicitly excluding `src/template/`. The `src/template/` directory contains template files for installed projects — these are never implementation code.

**Task dependency structure:** Cohorts 1 and 2 run in parallel (different file domains). Cohort 3 is blocked on 1 (waits for foundational learnings to land before the biome era builds on them). Cohort 4 is blocked on 2 (worktree patterns depend on the batch CLI patterns being captured first). Cohort 5 is blocked on both 3 and 4 (consolidates all learnings from earlier cohorts — the reviewer can then reference the already-written Learnings sections as the baseline).

## Dependency graph

```
Parallel start (2 unblocked):
  ├── evolve-cohort-1 (Bootstrap/Foundation: SQL builder, neverthrow, CLI handlers)
  └── evolve-cohort-2 (Batch CLI + Sub-agent: multi-ID patterns, DB connection bug)

After evolve-cohort-1:
  └── evolve-cohort-3 (Biome/Feb28: status layout, reviewer structure)

After evolve-cohort-2:
  └── evolve-cohort-4 (Stable rebuild + worktree arc)

After evolve-cohort-3 AND evolve-cohort-4:
  └── evolve-cohort-5 (Multi-plan execution: cycle/initiative, task(tg-xxx) commits)
```

## Projects explicitly excluded

- **Per-plan Worktree Model** — already evolved on 2026-03-01; learnings written to implementer.md (SQL builder rule) and quality-reviewer.md
- **Performance Intelligence** — in-progress (8/11 tasks); evolve after plan completes
- **Legacy no-timestamp projects** (Task Graph Implementation, Thin SQL Query Builder, etc.) — covered by Cohort 1 bootstrap diff; no separate evolve needed
- **Abandoned/draft projects** (Integration Test Speed, Integration Test Isolation, Initiative-Project-Task Hierarchy) — incomplete; skip
- **Pure cleanup projects** (Fix remaining tsc errors, resolve_type_errors, Multi-Agent Centaur Support 1 task) — type-fix or trivial; low agent learning value

## Scope reminder for all evolve tasks

When calling `git diff`, always scope to:

```bash
-- src/cli/ src/db/ src/domain/ src/plan-import/ src/mcp/ .cursor/agents/
```

Never include `src/template/` — it contains template copies for installed projects, not implementation code.

## Open questions

- None. All architectural choices made in the plan.

<original_prompt>
ok, now Id like you make a /plan for to review every other plan we have. they are all tracked via tg, you may just have to cross check the timestamps in TG with the commits timestamps to workout what was connected to what.

we want to idnetify all the previous plans/projects from either /plan or from tg projects. the key thing here is we need a set of tasks to run /evolve on
</original_prompt>
