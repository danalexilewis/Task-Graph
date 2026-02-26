---
name: Deps visibility, import robustness, stale doing, onboarding
overview: |
  Add dependency visibility (tg deps or tree in show), harden plan import for
  re-import and task_domain/task_skill, surface stale "doing" tasks, and
  improve README/onboarding (multi-agent link, optional tg doctor). Follows the
  rich planning format so agents get file trees, risks, tests, and per-task
  intent/suggested changes via tg context.
fileTree: |
  
    src/
      cli/
        index.ts              (modify — register deps command)
        show.ts               (modify — optional tree section)
        deps.ts               (create)
        status.ts             (modify — optional stale warning)
        doctor.ts             (create — optional)
      plan-import/
        importer.ts           (modify — junction cleanup robustness)
    __tests__/
      integration/
        cursor-import.test.ts (modify — re-import scenarios)
        deps-visibility.test.ts (create)
  docs/
    cli-reference.md          (modify — deps, stale, doctor)
  README.md                   (modify — multi-agent, next steps)
  plans/
    deps_import_stale_onboarding.md (this plan)
risks:
  - description: Import cleanup (task_domain/task_skill) may have more edge cases when plan has many tasks
    severity: medium
    mitigation: Add integration test that re-imports same plan twice; fix or avoid DELETE path that fails
  - description: Deps tree on very large graphs could be slow or noisy
    severity: low
    mitigation: Limit depth (e.g. 3 levels) and optionally --depth N; document in cli-reference
  - description: Stale threshold (e.g. 24h) may be wrong for long-running tasks
    severity: low
    mitigation: Make threshold configurable or document that "stale" is advisory only
tests:
  - "tg deps <taskId> shows blockers above and dependents below; empty when no edges"
  - "Re-import same Cursor plan twice (with task_domain/task_skill) succeeds and updates tasks"
  - "tg status or tg stale lists doing tasks with last event older than threshold (or stub)"
  - "tg doctor (or tg check) exits 0 when Dolt + config + schema OK; exits 1 with clear message when not"
  - "README contains link to multi-agent docs and a 'what to do next' section"
todos:
  - id: deps-visibility
    content: Add tg deps <taskId> or dependency tree in tg show (blockers above, dependents below)
    domain: [cli]
    skill: [cli-command-implementation]
    changeType: create
    intent: |
      Give agents and humans a quick view of why a task is blocked and what it unblocks.
      Reuse existing edge/task queries (show.ts already fetches blockers and dependents).
      Either add a dedicated `tg deps <taskId>` subcommand that prints a text tree (blockers
      above, dependents below), or add a "Dependency tree" section to `tg show`. Limit depth
      (e.g. 3) to avoid huge output on deep graphs. Follow patterns in show.ts for query structure.
    suggestedChanges: |
      In cli/deps.ts (new): query edges where to_task_id = taskId (blockers) and
      where from_task_id = taskId (dependents). Join to task for title/status.
      Print a simple tree, e.g. "Blockers: task-id-1 Title (status)" and "Dependents: ..."
      Alternatively in show.ts: add a subsection that formats blockers/dependents as a tree.
      Register deps command in cli/index.ts if new subcommand.

  - id: import-robustness
    content: Harden plan import so re-import and task_domain/task_skill updates don't fail
    domain: [schema, cli, plan-import]
    skill: [dolt-schema-migration, integration-testing]
    changeType: fix
    intent: |
      Plan import failed partway with "Dolt SQL query failed: DELETE FROM task_domain WHERE task_id = ..."
      leaving only one task imported. The importer likely deletes existing task_domain/task_skill
      rows for tasks being updated, and that path fails when junction tables are in use (e.g. FK
      or concurrency). Make import/re-import idempotent: either avoid deleting and upsert
      (insert or update junction rows by task_id+domain/skill), or wrap cleanup in a
      transaction and handle missing rows. Add integration test: import same plan twice,
      verify all tasks present and domains/skills correct.
    suggestedChanges: |
      In plan-import/importer.ts: locate where task_domain/task_skill are cleared for
      updated tasks. Prefer: delete only rows that are no longer in the new todo list
      (e.g. DELETE FROM task_domain WHERE task_id = ? AND domain NOT IN (new domains)),
      or use a safe upsert pattern. Add test in __tests__/integration/cursor-import.test.ts
      or new test file: import plan, then re-import same plan with one task title changed;
      expect success and correct task count and junction data.

  - id: stale-doing-signal
    content: Surface stale doing tasks (e.g. in tg status or tg stale) with no recent event
    blockedBy: [deps-visibility]
    domain: [cli]
    skill: [cli-command-implementation]
    changeType: create
    intent: |
      Help humans and agents notice tasks stuck in doing (e.g. >24h or configurable threshold).
      Option A: extend tg status with a line like "Stale (doing >24h): task-id Title" when
      there are doing tasks whose latest event is older than threshold. Option B: add
      `tg stale` that lists doing tasks with last event timestamp and age. Reuse event
      query pattern (max(created_at) per task for doing tasks). Threshold can be 24h
      default or read from env/config later.
    suggestedChanges: |
      Query: SELECT t.task_id, t.title, MAX(e.created_at) as last_at FROM task t
      JOIN event e ON e.task_id = t.task_id WHERE t.status = 'doing' GROUP BY t.task_id.
      Compare last_at to now() - 24h (or config). In status.ts add a "Stale:" line when
      count > 0, or create cli/stale.ts with tg stale that prints these tasks. Document in cli-reference.

  - id: readme-onboarding
    content: Update README with multi-agent link, next steps, and optional tg doctor or tg check
    domain: [cli]
    skill: [documentation-sync]
    changeType: modify
    intent: |
      Link to multi-agent docs (docs/multi-agent.md or equivalent) from README. Add a short
      "What to do next" section: create plan → tg import → execution loop (start/context/done).
      Optionally add tg doctor (or tg check): verify .taskgraph/config.json exists, Dolt repo
      exists and is initialized, and key tables exist (e.g. plan, task). Exit 0 if OK, 1 with
      clear message if not (e.g. "Run tg init first"). Register in cli/index.ts.
    suggestedChanges: |
      README.md: add "Multi-agent" bullet or section with link to docs/multi-agent.md. Add
      "What to do next" with 3–4 steps (plan, import, tg next, start/context/done). Optional
      cli/doctor.ts: readConfig(), check doltRepoPath exists, run a trivial doltSql (e.g.
      SELECT 1 FROM plan LIMIT 1) or check table existence; print "OK" or error and exit.
isProject: false
---

## Analysis

This plan addresses four follow-ups from the zoom-out after multi-agent centaur: (1) Beads-style dependency visibility for a single task, (2) robust re-import of Cursor plans when junction tables exist, (3) surfacing stale "doing" tasks so they don’t get forgotten, and (4) better onboarding (README + optional health check).

### Why these four

- **Deps visibility**: We have full-graph mermaid/dot and `tg show` with blockers/dependents as lists. A focused tree (blockers above, dependents below) for one task avoids opening the full graph and matches Beads’ `bd dep tree` idea.
- **Import robustness**: The multi-agent plan import failed partway (task_domain DELETE), so only one task was created. Re-import and updates must work when task_domain/task_skill are in use.
- **Stale doing**: Recovery (tg done --evidence "completed previously") exists, but there’s no proactive signal. A simple “these tasks have been doing a long time” reduces drift.
- **Onboarding**: New users and agents need a clear path (plan → import → execute) and a way to confirm the environment (optional tg doctor).

### Dependency graph

```mermaid
graph TD
  A[deps-visibility] --> C[stale-doing-signal]
  B[import-robustness]
  D[readme-onboarding]
  A -.-> B
  B -.-> D
```

- `stale-doing-signal` is blocked by `deps-visibility` only to reuse status/event awareness; it could be relaxed if we implement stale first.
- `import-robustness` and `readme-onboarding` are independent and can run in parallel with deps.

## Proposed changes (summary)

| Task | Key files | Approach |
|------|-----------|----------|
| deps-visibility | cli/deps.ts (new), show.ts or index.ts | Query edges + task; print tree; optional depth limit |
| import-robustness | plan-import/importer.ts | Fix task_domain/task_skill cleanup; add re-import test |
| stale-doing-signal | cli/status.ts or cli/stale.ts | Query doing tasks + max(event.created_at); compare to threshold |
| readme-onboarding | README.md, cli/doctor.ts (optional) | Links, "what to do next", doctor = config + Dolt + schema check |

## Risks (expanded)

- **Import**: Deleting and re-inserting junction rows during re-import may hit FK or ordering issues. Mitigation: upsert-style updates or delete only rows that are no longer in the new spec; integration test with two consecutive imports.
- **Deps tree**: Very large graphs could make the tree huge. Mitigation: depth limit (e.g. 3), optional `--depth N`, document in CLI reference.
- **Stale**: A single threshold (e.g. 24h) might flag legitimate long-running work. Mitigation: treat as advisory; consider env/config for threshold later.

## Testing strategy

- **deps**: Integration test that creates a small graph (A blocks B blocks C), runs `tg deps <B>`, asserts blockers and dependents appear in output.
- **import**: Integration test that imports a Cursor plan, then re-imports the same plan (e.g. one task title changed); assert no failure and correct task count and junction data.
- **stale**: Integration test that starts a task, optionally mocks or advances time, runs tg status or tg stale, asserts stale task appears (or stub with “doing” list only).
- **doctor**: Unit or integration test that tg doctor exits 0 in initialized repo and exits 1 with clear message when config or Dolt is missing.

## Open questions

- Whether to add `tg stale` as a separate command or only extend `tg status` with a "Stale:" line.
- Whether tg doctor should live in this plan or a follow-up (optional scope).

<original_prompt>
ok make me a plan
</original_prompt>
