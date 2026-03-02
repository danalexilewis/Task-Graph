# Lead: Meta

## Purpose

Enrichment lead that analyzes cross-plan (and optionally cross-project) task relationships. Proposes edges and notes; writes to the task graph only after user approval.

## Skill and agents

- **Skill:** `/meta` (`.cursor/skills/meta/SKILL.md`)
- **Agent files**: None (orchestrator performs analysis directly using crossplan CLI or manual analysis)

## Pattern

1. **Gather** — Run `tg crossplan summary --json` or fall back to manual analysis from plan files and task status.
2. **Analyze** — Identify file conflicts, domain clusters, architectural opportunities, and ordering.
3. **Present** — List proposed edges and notes to the user. Do NOT write yet.
4. **Write** — Only after explicit user approval, write edges and notes to the task graph.

## Input

- Cross-plan summary (from CLI) or manual plan/task analysis
- Scope: cross-plan (default) or cross-project (extended)

## Output

- Proposed edges (blocks/relates) and task notes
- Written to task graph only after user approval

## When to use

- User says "find patterns", "enrich tasks", or asks for cross-plan task analysis
- Multiple plans in the task graph; want to surface file conflicts, domain clusters, execution ordering
- Run after risk when both risk and enrichment are needed

## Recommended startup sequence

Run these four commands up front to build a complete picture before any analysis:

```bash
pnpm tg server start          # if DB is not up (check with pnpm tg status first)
pnpm tg status --projects     # see which plans are active/draft with outstanding work
pnpm tg next --json --limit 50  # get ALL runnable task IDs in one call — avoids N per-plan lookups later
pnpm tg crossplan summary --json > /tmp/crossplan.json  # save for repeated node analysis
```

Getting all runnable IDs upfront (`tg next --limit 50`) is the biggest time saver — it eliminates the pattern of "identify a pattern → make 5 separate `tg next --plan X` calls to resolve task IDs".

## `tg crossplan summary --json` structure

The JSON has four top-level keys:

| Key              | What it contains                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `domains`        | Array of `{ domain, plan_count, task_count, plan_titles }` — domain heat map                   |
| `skills`         | Array of `{ skill, plan_count, task_count, plan_titles }` — skill usage across plans           |
| `files`          | Array of `{ file, plan_count, plan_titles }` — files touched by multiple plans                 |
| `proposed_edges` | Array of `{ type, from_task_id, to_task_id, reason }` — mechanical file-overlap blocks/relates |

**Known quirk:** The `files` array includes tree diagram prefixes (e.g. `│   └── status.test.ts`) as file names when the CLI output was rendered with tree formatting. Strip or ignore these when the file path looks like a tree artifact.

## Filtering strategy

The crossplan summary includes all plans (including done/abandoned). Most patterns only matter for **active** and **draft** plans with outstanding work. Filter the project list to those states first, then only look up tasks within them.

The `proposed_edges` list will contain thousands of mechanical file-overlap pairs — do **not** try to act on them directly. Use them only as a signal to confirm patterns you've already identified by reasoning about plan intent and sequencing.

## Recurring high-value patterns

These patterns reliably surface actionable edges in any sufficiently large task graph:

### 1. Gate:full readiness gate

Look for plans with a `gate:full` run as their final task, and cross-reference with plans that fix pre-existing test failures. The fix plan's fix task should BLOCK the gate:full tasks — otherwise the gate:full runs produce noisy/misleading results.

### 2. CLI surface changes → benchmark/smoke/doc tests

Find plans that add, rename, or remove CLI commands or change CLI output format. Then find any benchmark, smoke test, or doc-review plans that assert on CLI output or documentation accuracy. The CLI change task should BLOCK (or RELATE to) the verification task, with a note about sequencing.

### 3. Execution tier ordering

Group active plans into dependency tiers and present as an ordering recommendation:

- **Tier 1 — Gate health** (fix test failures, improve isolation)
- **Tier 2 — Gate:full verifications** (plans that just need a clean gate:full run to close out)
- **Tier 3 — Major refactors** (schema changes, CLI renames, new commands)
- **Tier 4 — Validators** (benchmarks, doc reviews, smoke tests that assert the new state)

### 4. Domain cluster coordination

When 3+ active plans touch the same domain (e.g. `schema`, `cli`), note them as a cluster. Propose RELATES edges between tasks in different plans that modify the same file or table. Flag for sequential execution to avoid merge conflicts.

## Proposed edge quality

Prefer **fewer, higher-signal edges** over exhaustive mechanical coverage. A good edge batch is 5–10 edges with clear rationale. A bad batch is 100 edges from the `proposed_edges` list that the user can't evaluate. Apply the "would this prevent a real execution failure?" test before proposing.
