# Review Report — Strategic planning and benchmark plans

**Date:** 2026-03-02  
**Scope:** Review of last few benchmarking plans (fragmentation), initiative → project → task hierarchy, strategic planning mode, product analyst role.  
**Sub-agents:** investigator (code health), investigator (system health), generalPurpose (strategic planning assessment).

---

## Code health

### Files and roles

| Layer / area    | Path                   | Role                                                                                                            |
| --------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| **CLI**         | `src/cli/*.ts`         | Commander commands; orchestrate domain/db/export/plan-import; use `.match()` and `process.exit(1)` at boundary. |
| **DB**          | `src/db/*.ts`          | Dolt via execa or mysql2 pool; query builder, migrate, cache, hash-id, branch.                                  |
| **Domain**      | `src/domain/*.ts`      | Types/Zod, AppError, invariants, blocked-status, plan-completion, doc-skill-registry (some modules call db).    |
| **Plan import** | `src/plan-import/*.ts` | Parser (YAML → ParsedPlan); importer (DB writes, hash, domain).                                                 |
| **Export**      | `src/export/*.ts`      | Mermaid, DOT, markdown, graph-data; export uses `readConfig` from cli/utils.                                    |

### Architectural patterns

- **Layering:** db → domain (types/errors); domain/export/plan-import → cli. Domain is documented as “no DB” but several modules (invariants, blocked-status, plan-completion) call `query(repoPath)`. Export depends on `cli/utils` for `readConfig`.
- **Error handling:** neverthrow + AppError; CLI uses `.match()` and `process.exit(1)`.
- **SQL:** Query builder for most CRUD; raw SQL in migrate, next, domain invariants, plan-import, cli (with `sqlEscape` where needed).

### Risks and gaps

- **Domain purity:** Docs say domain has no DB; some domain modules do DB reads. Clarify in docs or move DB-backed logic to a service/db layer.
- **Config location:** `readConfig` in `cli/utils` used by export; consider `src/config.ts` to remove export → cli dependency.
- **process.exit(0) and stdout:** Race with flush when piped; status-live `--json` tests flaky. Prefer `process.exitCode = 0` and natural exit.
- **test:all vs gate:full:** test:all lacks db/mcp isolation; align or deprecate.
- **db/migrate.ts:** Large; consider splitting by era or extracting helpers.
- **Raw SQL in domain:** invariants and blocked-status; consider moving queries to db/ and keeping domain pure.

### Suggested follow-up (code health)

1. Clarify or fix domain layering (docs or move DB-backed logic).
2. Fix status-live / process.exit race.
3. Extract config from cli/utils to shared module.
4. Align test:all with gate:full or remove.
5. Reduce raw SQL in domain (move to db/).
6. Break up db/migrate.ts.

---

## System health

### Summary

- **Task graph:** Multiple benchmark plans and projects; live state requires `pnpm tg status --tasks` / `--projects`.
- **Gate:** status-live `--json` flakiness and test:all isolation documented; no other gate flakiness found.
- **Dependencies/tooling:** Node ≥18, Bun ≥1; lockfile and stack consistent.
- **Operations:** Worktree/gate:full rules and recovery documented; plan-branch check after first `tg start --worktree` recommended.

### Issues

| Issue                | Notes                                                             |
| -------------------- | ----------------------------------------------------------------- |
| Stale `doing`        | No automated reclaim; manual or future `tg reclaim`.              |
| Plan branch          | Verify `plan-p-*` in `tg worktree list --json` after first start. |
| status-live `--json` | 3 tests; process.exit(0) vs stdout flush when piped.              |
| test:all             | Different isolation from gate:full; mock bleed risk.              |

### Suggested follow-up (system health)

1. Run `tg status --tasks` / `--projects`; clear stale doing; verify plan worktree after first start.
2. Fix status-live flakiness (process.exitCode = 0).
3. Align or document test:all vs gate:full.
4. Process pending learnings (done this session).

---

## Strategic planning and benchmark plan fragmentation

### 1. Why benchmark plans were too small (root cause)

- **One plan file = one project.** `tg import` takes one file and creates/updates one project row; format has single `name`, `overview`, `todos`. So the natural unit is one deliverable per file; there is no format for “this document defines several projects under one initiative.”
- **Initiative design reinforced it.** `26-03-01_benchmarking_initiative.md` defines four projects as **four plan files**, each imported and then attached via `tg initiative assign-project`. So the pattern was: initiative = grouping of many plan files; each file = one project.
- **Plan skill has no scope level.** Modes (Greenfields, Improvement, Refactor, Pivot) describe **kind** of work for **one** scope, not “break this initiative into several projects.” Planner-analyst is single-plan: one request → one task breakdown.
- **Consequence.** The 1–2 task plans (Sample Alpha/Beta, Stats Benchmark Only, Import/Stats Benchmark Plan) were created as separate “fixed-scope” units. With no guidance to batch deliverables, each scenario became its own file → its own project.

**Summary:** Fragmentation comes from (1) schema and import enforcing one file → one project, (2) benchmarking initiative design using that pattern, (3) plan skill and planner-analyst being single-plan only, and (4) no strategic/multi-project authoring path.

### 2. Initiative → plan (multi-project) → tasks: schema fit and changes

**Schema already matches.**

- Initiative has many projects; each project has many tasks. `project.initiative_id` and `initiative` table support initiative → projects → tasks. No new tables needed.

**Gap is authoring and import.**

- Today: one plan file → one `ParsedPlan` → one project row → all tasks under that `plan_id`.
- To support “one plan file = multiple projects”:

| Layer           | Change needed                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Plan format** | Add a way to define multiple projects (e.g. top-level `projects:` array with `name`, `overview`, `todos` per project). Keep current top-level form as single-project for backward compatibility. |
| **Parser**      | Support multi-project structure → e.g. `ParsedStrategicPlan { initiative?, projects: ParsedPlan[] }` or array of plans with project metadata.                                                    |
| **Import**      | For multi-project: create/update one project row per project, assign to initiative if specified, upsert tasks per project with correct `plan_id`.                                                |
| **Export**      | Multi-project: one exported file with multiple project sections, or keep export per-project and treat strategic as authoring-only.                                                               |
| **CLI**         | e.g. `tg import <file> --format cursor` creating N projects; initiative from frontmatter or `--initiative`.                                                                                      |

Single-project plans (no `projects:`) continue to behave as today.

### 3. Recommendation: strategic planning mode (plan skill)

**What it would do**

- **Input:** Initiative-level goal (e.g. “TaskGraph Benchmarking,” “first benchmarking version”).
- **Process:** Decompose into a small set of **key deliverables (projects)** (e.g. 2–5), then for each project define **scope and tasks**. Output is a **strategic plan**: initiative → projects → tasks (one multi-project plan file or structured set of N plan files).
- **Difference from current modes:** Greenfields/Improvement/Refactor/Pivot answer “what **kind** of work?” for **one** scope. Strategic mode answers “what are the right **scopes** (projects) and what work belongs in each?” — a **scope-level** mode.

**Concrete behavior**

- **Trigger:** “plan the initiative,” “break down this initiative,” “strategic plan for X,” or explicit request for multiple deliverables/projects under one goal.
- **Analyst:** Product analyst (or planner-analyst with initiative-level prompt) to propose project boundaries and scope; optionally planner-analyst per project for task-level breakdown.
- **Orchestrator checklist (strategic):** Right project boundaries? Each project one coherent deliverable? Cross-project dependencies and ordering clear? Task counts per project reasonable (not 1–2 unless intentional)?
- **Output:** One strategic plan file in multi-project format (once supported), or one initiative plan that lists projects and points to N plan files.

**Placement**

- **Recommendation:** New mode alongside Greenfields/Improvement/Refactor/Pivot (Option A). One skill handles both “plan this feature” (single project) and “plan this initiative” (multi-project), with a clear classification step.

### 4. Recommendation: product analyst role

**Would it help?**

- Yes. A **product analyst** can own **initiative → project**: turn a strategic goal into candidate **project boundaries** (deliverables), **in/out scope** per project, and **ordering/dependencies** between projects. Planner-analyst owns **codebase + task-graph facts** and **task-level** breakdown for one project.

**Several in parallel?**

- **Possible but not the default.** One product analyst per initiative producing the full project list and scope is the default. Use **parallel** only for large initiatives with clearly separated strands, then merge/align boundaries in one place.

**Interaction with planner-analyst**

- **Sequential:**
  1. **Product analyst** (strategic): “Given initiative X, what are the projects and their scope?” → project list + scope per project.
  2. **Orchestrator** turns that into strategic plan structure (multi-project document or project list).
  3. **Planner-analyst** (optional, per project): “For project P, given scope and codebase, what are the tasks and dependencies?” → task breakdown for P.
  4. **Orchestrator** fills in tasks for each project.

- **Split:** Product analyst = **what** (projects and scope). Planner-analyst = **how** (tasks, files, risks, dependencies) for a given project.

**Lead doc / agent template**

- Add `docs/leads/product-analyst.md` and `.cursor/agents/product-analyst.md`: input = initiative title/description and optional context; output = structured list of projects (name, overview, in-scope, out-of-scope, suggested order/dependencies), optionally high-level phases. No full YAML plan; task-level detail only at rough level (e.g. “3–5 tasks”) unless combined with planner-analyst.

---

## Summary and next steps

### Overall health

- **Code:** Clear structure (cli/domain/db/export/plan-import); main gaps are domain/DB boundary, config location, process.exit race, and migrate/raw-SQL hotspots.
- **System:** Task graph and gate patterns documented; status-live and test:all need fixes; operational rules clear.
- **Planning:** Benchmark fragmentation is a consequence of one-plan-per-file and no strategic mode; schema already supports initiative → projects → tasks; the gap is authoring and import.

### Top actionable items

1. **Strategic planning mode** — Add a scope-level mode to the plan skill: classify “strategic” when the request is initiative-level or multi-project; use product analyst (or initiative-level planner-analyst) for project boundaries, then task breakdown per project; output multi-project plan format once parser/import support it.
2. **Product analyst** — Introduce product analyst lead and agent template; use for initiative → project step; sequence with planner-analyst for per-project task detail.
3. **Multi-project plan format and import** — Design and implement: frontmatter or body structure for multiple projects, parser changes, import creating N projects and assigning to initiative, backward-compatible single-project behavior.
4. **Fix status-live / process.exit** — Resolve flakiness for status `--json` tests and gate:full.
5. **Domain and config** — Clarify or refactor domain/DB boundary; extract `readConfig` to shared config module.

### Suggested follow-up tasks (for a plan)

- **Strategic planning mode:** Plan skill changes (classification, product analyst dispatch, strategic checklist, output format).
- **Product analyst:** Lead doc, agent template, and contract (input/output).
- **Multi-project format:** plan-format.md and plan-import.md updates; parser and importer changes; CLI import behavior; export behavior.
- **Code health:** Domain layering, config extraction, process.exit fix, test:all vs gate:full, migrate split, raw SQL in domain (as separate tasks or a small initiative).

---

_Report synthesized from investigator (code health), investigator (system health), and generalPurpose (strategic planning) sub-agent outputs. No file edits or destructive commands were run by sub-agents._
