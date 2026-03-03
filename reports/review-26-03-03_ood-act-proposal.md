# Review Report — 2026-03-03 (OOD/Act proposal)

**Scope:** Code health, system health, and analysis of the proposal to change sub-agent behaviour so the **orchestrator/lead does OOD** (Observe, Orient, Decide) and the **sub-agent does only Act** — i.e. sub-agent comes into existence with a clear action to take on a given file path.

---

## Code health

### Files and roles

| Area | Key files | Role |
|------|-----------|------|
| **CLI** | `src/cli/index.ts`, `context.ts`, `start.ts`, `done.ts`, `next.ts`, `status.ts`, `worktree.ts` | Commander commands; orchestrate db/domain; only place that should call `process.exit()` and `.match()` for user-facing errors. |
| **API (SDK)** | `src/api/client.ts`, `src/api/types.ts` | Programmatic next, context, status; used by CLI context and MCP. Not a separate layer above domain: calls db, cli helpers, and domain. |
| **Domain** | `src/domain/errors.ts`, `invariants.ts`, `types.ts`, `doc-skill-registry.ts`, `token-estimate.ts`, `blocked-status.ts` | Types, Zod, invariants. Blur: `blocked-status.ts` calls query/sqlEscape (domain → db). |
| **DB** | `src/db/connection.ts`, `query.ts`, `cached-query.ts`, `migrate.ts`, `branch.ts`, `commit.ts` | Dolt access, migrations, commits. |
| **Plan-import** | `src/plan-import/parser.ts`, `importer.ts` | Parser is pure Result; importer throws on many error paths. |
| **Agent surface** | `.cursor/agents/*.md`, `subagent-dispatch.mdc`, `src/cli/context.ts`, `src/api/client.ts` | Templates define input/output contracts; context building in api/client (`runContextChain`) + cli/context (getHiveSnapshot). |

**Context building:** Single-task context flows CLI → TgClient.context() → runContextChain() (task, plan, task_doc, task_skill, blockers, token budget). **Gap:** Docs and rules mention `related_done_by_domain` / `related_done_by_skill`; ContextOutput and runContextChain do **not** populate them.

### Architectural patterns

- **Intended:** db → domain → cli with .match() at boundary.
- **Actual:** API depends on CLI (resolveTaskId, fetchStatusData, recoverStaleTasks) and db; domain/blocked-status does I/O. plan-import and several CLI paths use throw in the middle of flows.
- **Error handling:** Result/neverthrow dominant; runContextChain and getHiveSnapshot are throw-based inside; context path is the main inconsistency.

### Tech debt and hotspots

1. **Worktree + plan branch lifecycle** (start.ts, done.ts, worktree.ts) — plan branch creation, plan_worktree row, merge order, --merge semantics; memory documents multiple edge cases.
2. **Context pipeline** (api/client runContextChain) — long, throw-based, raw SQL; adding related_done or reshaping for OOD/Act would touch this and types.
3. **status.ts** — very large (1300+ lines), central for orchestrator; changes are costly.
4. **Dolt JSON** — double-encode unwrap duplicated in done.ts and utils.ts.

### Risks and gaps

1. **Context contract vs implementation** — related_done promised in docs but not in runContextChain/types; any “orchestrator builds richer context” or “sub-agent Act only” relies on context shape.
2. **runContextChain throws** — Refactors (OOD/Act, related_done) risk unhandled rejections unless the chain is converted to Result.
3. **Worktree/plan-branch lifecycle** — Already fragile; any change to how orchestrator or implementer start/done touches it.
4. **API depends on CLI** — Shared “context service” would be clearer with a core used by both CLI and API.
5. **Under-documented for agents** — Actual context payload (what’s in tg context --json, what’s missing) is not summarized in one place.

### Suggested follow-up (code health)

- Add related_done to context (or remove from docs); implement or fix the contract.
- Make runContextChain Result-based.
- Single helper for Dolt JSON string unwrap; use in done.ts and utils.ts.
- Document “Context output (tg context --json)” for agents: every field, type, and placeholder mapping.
- Contract test for context JSON shape (keys/types expected by templates).

---

## System health

### Summary

Validation (cheap-gate / gate:full), tooling (pnpm, Bun, Dolt), and recovery are documented. Task graph has two tasks in `doing` (CQRS write queue, Squash-merge plan summary); several blocked tasks. Known gate quirks in memory (status-live --json, test:all vs gate:full isolation).

### Issues

| # | Issue | Severity |
|---|--------|----------|
| 1 | Two tasks in `doing` (CQRS “Wire write commands”; Squash-merge “Add tg plan summary”) — risk of stale state if no active owner | Medium |
| 2 | status-live --json tests (3) may fail in gate:full (exit/drain vs piped stdout) | Medium |
| 3 | pnpm test:all runs without db/mcp isolation; mock bleed possible | Low |
| 4 | Many tasks have hash_id null until Short Hash Task IDs plan completes | Low |

### Operational readiness

- Recovery: tg done --force for completed-but-mislabeled tasks; then status --tasks.
- Stale doing: Resolve or document the two current doing tasks.
- Plan-merge: wt merge main -C &lt;plan-worktree-path&gt; after last task; plan-branch pre-flight before Wave 1.
- Gate:full only from plan worktree after build there; never from main.

---

## Sub-agent behaviour proposal: OOD (orchestrator) + Act (sub-agent)

### Current behaviour (full loop per sub-agent)

Today, sub-agents are **expected to run a full OODA loop**:

- **Observe:** They receive rich context (intent, doc_paths, skill_docs, suggested_changes, file_tree, risks, related_done) and are told to “Load context,” “Read any domain docs and skill guides,” “Read docs/agent-field-guide.md,” “Check breadcrumbs.”
- **Orient:** “Assess before following”; “If the area has inconsistent patterns, note and follow the better pattern.”
- **Decide:** They choose *how* to implement (which files to touch, approach, patterns).
- **Act:** They implement, commit, tg done.

The orchestrator does **some** OOD: it runs `tg next`, does file-conflict check, runs `tg context <taskId> --json`, and builds the prompt. But the **decision of what exactly to do and where** is left to the sub-agent. The prompt is “here is the task intent, scope, suggested changes, file tree — go implement,” not “on file F, do action A.”

### Desired behaviour (OOD at lead, Act at worker)

- **Orchestrator/lead:** Owns **Observe** (gather task, plan, files, docs, hive), **Orient** (understand scope, conflicts, patterns), and **Decide** (choose the concrete action(s) and target file path(s)).
- **Sub-agent:** Receives a **clear, immediate action** bound to a **given file path** (or small set of paths). It **does not** re-observe, re-orient, or re-decide; it **acts** (edit, run command, tg done) and reports back.

So the sub-agent “comes into existence with a clear action to take on a given file path.”

### What would need to change

1. **How orchestrators/leads define context for sub-agents**
   - **Today:** Context is “task + plan + docs + suggested changes + file tree” — outcome of OOD is implicit in the task, the sub-agent re-does OOD.
   - **Target:** Context becomes “**action directive** + **file path(s)** + minimal supporting data.” The orchestrator (or a dedicated “decider” step) must produce something like:
     - “In `src/cli/context.ts`: add a function `getRelatedDoneTasks(taskId)` that returns related_done_by_domain and related_done_by_skill; call it from runContextChain and attach to context JSON.”
     - Or: “In `src/db/query.ts`: replace the raw SQL in function X with `query(repoPath).insert(...)` per code guidelines.”
   - So the **unit of work** shifts from “task (intent + scope)” to “action (verb + path + spec).” That may mean:
     - **Larger tasks** get split into N action directives, each dispatched as one sub-agent call (one Act per directive), or
     - **One task** still maps to one sub-agent, but the prompt is rewritten so the sub-agent receives “action + path” as the primary instruction and the rest as read-only reference (no “decide how” — “do this”).

2. **Sub-agent contracts (implementer, reviewer, etc.)**
   - **Implementer:** Template would de-emphasise “Load context,” “Assess before following,” “Do the todos” (open-ended). It would emphasise “You have one action. Perform it on the given path(s). Do not explore or decide; execute. If the action is impossible (e.g. file missing, precondition false), report VERDICT: FAIL and SUGGESTED_FIX.”
   - **Placeholders:** In addition to (or instead of) {{INTENT}}, {{SUGGESTED_CHANGES}}, {{FILE_TREE}}, the orchestrator would pass something like {{ACTION_DIRECTIVE}} and {{TARGET_PATHS}} (and optionally {{PRECONDITIONS}} so the sub-agent can bail fast).
   - **Reviewer:** Could stay as-is (evaluate the outcome of the Act) or could be given a checklist derived from the same action directive (e.g. “Verify that getRelatedDoneTasks exists and is called in runContextChain”).

3. **Context shape and pipeline**
   - **tg context:** Today it returns “task-centric” (intent, docs, suggested changes, file tree). For “action + path” dispatch, the orchestrator might need either:
     - **Option A:** Same `tg context --json`; the orchestrator **interprets** it and writes the action directive itself (orchestrator does OOD and turns context into directive text).
     - **Option B:** New output or mode, e.g. “suggested_actions” or “action_directives” — something the plan or a planner-analyst produces, and context just carries it. That would require plan/context schema and possibly planner-analyst to output “action list” instead of or in addition to “task list.”
   - **Token budget:** If the sub-agent prompt shrinks to “action + paths + minimal context,” token use per sub-agent could drop; if the orchestrator’s prompt grows (it does more OOD), orchestrator token use could rise. Worth modelling.

4. **Execution lead and work skill**
   - **Work skill / execution lead:** Currently “tg next → file conflict check → build prompt from tg context → dispatch.” For OOD/Act:
     - After `tg next` and conflict check, the lead would either (a) run `tg context` and **then** produce the action directive(s) for each task (lead does Decide), or (b) call a separate “decider” agent or step that consumes context and returns action directives, then dispatch implementers with those directives.
   - So the execution lead (or a new “decider” role) would need a clear place and template for “from task context → action directive + paths.”

5. **Risks of the shift**
   - **Orchestrator wrong or incomplete:** If the lead’s “decision” is wrong (wrong file, wrong action, missed precondition), the sub-agent will still “act” correctly on that input — so errors show as wrong work or wrong branch. Recovery and plan-merge discipline become more important; orchestrator quality matters more.
   - **Over-constraint:** Some tasks are exploratory or ambiguous; forcing “one action, one path” might not fit. So the pattern might be “prefer OOD/Act when the task is well-scoped; fall back to full-loop (current) for exploratory or ambiguous tasks.”
   - **Context contract:** The code-health finding stands: related_done and other promised fields are missing. Any move to “orchestrator builds richer context” or “orchestrator writes action directive from context” will rely on a correct, documented context shape; fixing the context contract is a prerequisite.

### Risk assessment (proposal)

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Orchestrator decides wrong action/path | High (wrong edits, wrong branch) | Medium | Clear checklist for “decide” step; allow fallback to full-loop for ambiguous tasks; tg note on direct execution |
| Context shape wrong or missing | High (wrong or empty directive) | Medium | Implement and document context contract (related_done, etc.); contract test for context JSON |
| Sub-agent receives “act” but preconditions false | Medium (wasted cycle, FAIL) | Medium | Include PRECONDITIONS in prompt; sub-agent exits fast with VERDICT: FAIL and SUGGESTED_FIX |
| More orchestrator token use | Low | High | Monitor; optional “light” context mode for decider |

---

## Summary and next steps

### Overall health

- **Code:** Clear layering in most places; **context pipeline** and **context contract** are the main gaps. Worktree/plan-branch and status.ts are hotspots. Addressing related_done and runContextChain error style will help any future change (including OOD/Act).
- **System:** Task graph and gate are in good shape; two doing tasks and a few gate quirks need resolution. Recovery and plan-merge steps are documented.

### Top actionable items

1. **Fix context contract** — Implement or remove related_done; document tg context --json shape for agents; add a contract test.
2. **Make runContextChain Result-based** — Reduces risk when adding OOD/Act or related_done.
3. **Resolve stale doing tasks** — CQRS and Squash-merge; done with evidence or note.
4. **Plan and document OOD/Act** — If adopting the proposal: (a) define “action directive” format and placeholders ({{ACTION_DIRECTIVE}}, {{TARGET_PATHS}}); (b) decide where “Decide” lives (execution lead vs separate decider); (c) update implementer (and optionally reviewer) template to “Act only” with fallback for ambiguous tasks; (d) keep recovery and plan-merge explicit in orchestrator checklist.

### Optional: evolve integration

The Code health and System health sections of this report can be passed to the **/evolve** skill as additional inputs when evolving a plan — evolve will use them alongside plan diffs for pattern mining and routing learnings to agent templates and docs.
