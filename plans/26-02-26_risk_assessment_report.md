---
name: Risk Assessment Report
overview: Cross-plan risk assessment (assess-risk skill). Rates entropy, surface area, backwards compat, reversibility, complexity concentration, testing surface, performance risk, blast radius; lists file overlaps, recommended execution order, and mitigations.
---

**Source:** `pnpm tg crossplan summary --json` + plan files under `plans/` (2026-02-26).

---

## Summary

| Plan / Scope                           | Entropy | Surface Area | Backwards Compat | Reversibility | Complexity Concentration | Testing Surface | Performance Risk | Blast Radius | Overall  |
| -------------------------------------- | ------- | ------------ | ---------------- | ------------- | ------------------------ | --------------- | ---------------- | ------------ | -------- |
| Short Hash Task IDs                    | H       | H            | M                | M             | **H**                    | M               | L                | M            | **H**    |
| Dolt Branch Per Agent                  | M       | M            | L                | M             | **H**                    | M               | L                | M            | **M–H**  |
| Git Worktree Isolation                 | M       | M            | L                | M             | **H**                    | M               | L                | M            | **M–H**  |
| Context Budget and Compaction          | M       | M            | L                | L             | **M**                    | M               | L                | L            | M        |
| External Gates                         | M       | M            | L                | M             | **M**                    | M               | L                | M            | M        |
| Two-Stage Review                       | L       | M            | L                | L             | **M**                    | M               | L                | M            | M        |
| TaskGraph MCP Server                   | M       | M            | L                | L             | **M**                    | M               | L                | M            | M        |
| Persistent Agent Stats                 | L       | M            | L                | L             | **M**                    | M               | L                | L            | M        |
| Dolt Replication                       | M       | M            | L                | M             | **M**                    | M               | L                | L            | M        |
| Task Templates (Formulas)              | M       | M            | L                | M             | M                        | M               | L                | L            | M        |
| Sharpen Orchestrator Compliance        | L       | M            | L                | L             | **M**                    | L               | L                | M            | L (done) |
| Multi-Agent Centaur Support            | L       | M            | L                | L             | **M**                    | L               | L                | M            | M        |
| Meta-Planning Skills                   | L       | M            | L                | L             | M                        | M               | L                | L            | L (done) |
| Restructure package / npm layout       | M       | H            | **H**            | M             | M                        | M               | L                | M            | M–H      |
| Rich Planning / Plan Import Robustness | M       | M            | L                | L             | M                        | M               | L                | L            | M        |

_L = Low, M = Medium, H = High. **Bold** = key driver for overall risk._

---

## Cross-Plan Interactions

### File overlaps

- **docs/cli-reference.md** — 10 plans touch it (Context Budget, Task Templates, Git Worktree, TaskGraph MCP, Persistent Agent Stats, External Gates, Multi-Agent, Meta-Planning, Short Hash, Dolt Replication). Highest concentration; doc-only but merge churn and consistency risk.
- **src/cli/index.ts** — 6 plans (Git Worktree, TaskGraph MCP, Persistent Agent Stats, External Gates, Meta-Planning Skills, Dolt Replication). Command registration and wiring; sequential ordering recommended to avoid merge conflicts.
- **src/cli/start.ts** and **src/cli/done.ts** — 3 plans each: **Git Worktree Isolation**, **Dolt Branch Per Agent**, **Short Hash Task IDs**. These three plans all extend the start/done lifecycle. Running them in parallel on the same branch will create conflicts; run one to completion before the next.
- **.cursor/rules/subagent-dispatch.mdc** — 3 plans: **Sharpen Orchestrator Compliance** (done), **Git Worktree Isolation**, **Two-Stage Review**. Git Worktree adds worktree dispatch; Two-Stage adds two-stage review flow. Order: complete any remaining Sharpen sync, then Two-Stage (review flow), then Git Worktree (dispatch rule update) so worktree changes sit on top of the new review flow.
- **src/cli/context.ts** — 2 plans: **Context Budget and Compaction**, **Short Hash Task IDs**. Context Budget adds token estimation/compaction; Short Hash adds hash_id display. Either order is feasible; Context Budget is self-contained, Short Hash touches many more files.
- **src/db/migrate.ts** and **src/domain/types.ts** — 2 plans each: **External Gates**, **Short Hash Task IDs**. Schema and type changes; run one plan’s migrations and type changes before the other to keep migrations and types consistent.
- **.taskgraph/config.json** — 3 plans: Context Budget, Dolt Branch, Dolt Replication. Additive config keys; lower conflict risk if keys are distinct.

### Domain/skill clusters

- **cli** — 12 plans, 26 tasks. Most plans add or extend CLI commands; batching “add new command” work (e.g. gate, stats, sync) can reduce context switching.
- **documentation-sync** — 11 plans. Many tasks are “update cli-reference” or “document X”; consider doing doc passes after related code is stable.
- **cli-command-implementation** — 10 plans. Shared patterns (resolveTaskId, readConfig, register command); Short Hash’s resolver will benefit Dolt Branch and Git Worktree if Short Hash is done first (all need task ID handling).
- **integration-testing** — 10 plans. Each plan adds or extends integration tests; test layout and Dolt test repo usage are shared.

### Impact on Complexity Concentration and ordering

- **Short Hash Task IDs** has the widest touch surface (context, start, done, migrate, types, utils, show, status, block, note, split, schema, cli-reference) and overlaps with Context Budget (context.ts), Dolt Branch and Git Worktree (start/done). It also introduces the resolver used by other CLI work. Doing **Short Hash first** reduces future merge points and gives other plans a stable task-id contract.
- **start/done stack**: Dolt Branch and Git Worktree both add optional behavior to start/done (branch vs worktree). They are mutually compatible in concept but both modify the same files. Run **Dolt Branch Per Agent** then **Git Worktree Isolation** (or the reverse), but not in parallel.
- **subagent-dispatch.mdc**: Two-Stage Review and Git Worktree both change the dispatch rule. **Two-Stage Review** first (review flow), then **Git Worktree** (worktree in dispatch) keeps a single logical change to the rule.
- **index.ts** and **cli-reference.md**: Spread work so that no two plans are editing the same command or same doc section in parallel; use small, focused PRs or task ordering so one plan’s index/doc changes land before the next.

---

## Overall Risk

**Overall risk: Medium–High**, with a few plans at **High** (Short Hash Task IDs) or **M–H** (Dolt Branch, Git Worktree) due to **complexity concentration** on shared files (start/done, context, index, subagent-dispatch) and, for Restructure, **backwards compatibility** (package layout, entrypoints). Entropy and surface area are mostly Medium across plans. Reversibility is generally good (feature flags, additive config, optional flags). The main drivers are: (1) **multiple plans touching start.ts/done.ts and subagent-dispatch.mdc**, (2) **Short Hash’s broad CLI and schema surface**, and (3) **docs/cli-reference.md and src/cli/index.ts** shared by many plans. Mitigations: enforce **execution order** for plans that share files, do **Short Hash early** to establish the task-id resolver and reduce later conflicts, and batch **documentation** updates after code stabilizes.

---

## Mitigation Strategies

- **Short Hash Task IDs**: Implement resolver and schema/migration first; then update CLI commands in a single pass. Run integration tests after all command updates. Consider feature-flag or config to toggle short-hash display until stable.
- **Dolt Branch / Git Worktree**: Run one plan fully (all tasks) before starting the other. Prefer Dolt Branch first (DB-level isolation) then Git Worktree (filesystem isolation), or vice versa by product priority; avoid parallel edits to start.ts/done.ts.
- **Two-Stage Review vs Git Worktree**: Complete Two-Stage Review (spec/quality agents + dispatch rule) before Git Worktree’s dispatch-rule changes so worktree instructions are added to the final flow.
- **Context Budget vs Short Hash**: Either order is acceptable; Context Budget is localized to context and config. If doing Short Hash first, ensure context.ts changes for Short Hash (display hash_id) don’t block Context Budget’s compaction logic.
- **External Gates vs Short Hash**: Run schema/migrate and types for one plan before the other; e.g. External Gates (new gate table) then Short Hash (task hash_id), or Short Hash first if it’s the higher priority.
- **index.ts and cli-reference.md**: Serialize “add command” and “add doc section” work across plans; use clear, small commits so conflicts are easy to resolve.
- **Restructure package / npm layout**: Treat as a dedicated change window; run full test suite and smoke tests after restructure; document breaking changes and migration for consumers.
- **Testing**: Each plan that adds integration tests should run in isolation (fresh Dolt repo or temp dir) to avoid cross-test pollution; keep shared test helpers in sync.

---

## Key Risks to Monitor

1. **Merge conflicts on start.ts, done.ts, and subagent-dispatch.mdc** — Multiple plans modify these; enforce ordering and avoid parallel work on the same file.
2. **Short Hash collision and resolver behavior** — Hash space and ambiguity handling; monitor integration tests and any user reports of wrong task resolved.
3. **Dolt Branch merge conflicts and orphan branches** — Monitor merge success rate and add cleanup/visibility (e.g. tg status for stale branches) as planned.
4. **docs/cli-reference.md accuracy** — Many plans update it; ensure one owner or a final pass so options and commands stay consistent.
5. **Restructure package layout** — Entrypoints and imports; verify `tg` and `tg-mcp` (or equivalent) and consuming repos after restructure.

---

## Prioritized Risk Summary & Recommended Execution Order

1. **Foundation / low conflict**
   - **Meta-Planning Skills** — Done; no action.
   - **Sharpen Orchestrator Compliance** — Done; sync template if not already.
   - **Two-Stage Review** — Localized to agents and dispatch rule; do before other dispatch/rule changes. Delivers clear spec vs quality feedback.

2. **High concentration (serialize)**
   - **Short Hash Task IDs** — Do early. Establishes resolver and hash_id column; many other plans benefit from stable task-id handling. Reduces future conflicts on context, start, done, and CLI commands.
   - **Dolt Branch Per Agent** — Then do this (or Git Worktree, but not both in parallel). Completes start/done branching story.
   - **Git Worktree Isolation** — After Dolt Branch (or after Short Hash if skipping Dolt Branch). Update subagent-dispatch after Two-Stage is in place.

3. **Medium concentration (order by dependency)**
   - **External Gates** — Schema and CLI; can run after or alongside other “new command” work; avoid parallel migration/type changes with Short Hash.
   - **Context Budget and Compaction** — Can run in parallel with plans that don’t touch context.ts; if Short Hash is in progress, coordinate context.ts changes.
   - **TaskGraph MCP Server** — New surface (src/mcp/); register in index after other index changes if possible to avoid repeated merge.
   - **Persistent Agent Stats** — New command; depends on review event convention (Two-Stage helps). Can follow Two-Stage Review.
   - **Dolt Replication** — New sync command and config; lower conflict risk if done after config-heavy plans (Context Budget, Dolt Branch).

4. **Documentation and restructure**
   - **Task Templates (Formulas)**, **Plan Import Robustness**, **Export Markdown / tg status**, **tg plan list**, **Rich Planning** — Order by product priority; batch doc updates (cli-reference, schema) where possible.
   - **Restructure package — src at root, standard npm layout** — Run when ready for a dedicated breaking-change window; run after or before other plans by release strategy.
   - **Multi-Agent Centaur Support**, **Agent Sync**, **Project Rules**, **Cursor Plan Import** — Rule and doc changes; coordinate with Sharpen/Two-Stage so agent and rule set stay consistent.

**Suggested next runnable (from tg status):** Short Hash Task IDs (“Create hash-id generation module”, “Update schema.md and cli-reference.md with hash ID documentation”) is consistent with doing Short Hash early. If you prefer to reduce risk on start/done first, consider Dolt Branch or Git Worktree as the first plan instead, then Short Hash.
