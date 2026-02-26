---
name: Cursor Plan Import and Agent Workflow
overview: "Add Cursor Plan format support to tg import, and document an agent workflow: create plan → pause for review → interpret user response (proceed / just add / stop) → optionally import and execute tasks."
todos:
  - id: cursor-parser
    content: Add Cursor Plan parser — parse YAML frontmatter, extract name/overview/todos; map id→external_key, content→title, status→task status; support optional blockedBy on todos
    status: completed
  - id: format-detection
    content: Add format auto-detection or --format cursor flag to tg import; try Cursor format first when file has YAML frontmatter with todos
    status: completed
  - id: status-mapping
    content: Map Cursor todo status (completed/pending) to taskgraph task status (done/todo); handle other statuses if present
    status: completed
  - id: importer-integration
    content: Wire Cursor parser output into existing upsertTasksAndEdges; ensure blockedBy works when todos have explicit blockers
    status: completed
  - id: agent-instructions
    content: Add plan-review workflow to AGENT.md — create plan in plans/, pause for review, interpret proceed/thanks/just-add responses, run tg import when appropriate
    status: completed
  - id: intent-table
    content: Document user intent table in AGENT.md — proceed→import+execute, thanks/ok→do nothing, just add tasks→import only
    status: completed
  - id: tests
    content: Add parser test for Cursor format and integration test for tg import plans/foo.md --format cursor
    status: completed
isProject: false
---

# Cursor Plan Import and Agent Workflow

## Goal

Enable a seamless plan-to-execution flow:

1. User asks agent to make a plan.
2. Agent creates a plan file in `plans/` (Cursor format with YAML frontmatter + todos).
3. Agent pauses and asks for review.
4. User responds:
   - **"proceed" / "go ahead" / "execute"** → Agent imports tasks to taskgraph and executes them (tg next → start → work → done).
   - **"thanks" / "that's good" / "ok" / "don't do anything"** → Agent does NOT import; treat as acknowledgement only.
   - **"just add the tasks" / "add to taskgraph only"** → Agent imports but does NOT execute.

5. When executing: agent runs `tg next` → `tg show` → `tg start` → does the work → `tg done --evidence "..."`.

---

## Current State

- **Parser** ([src/plan-import/parser.ts](src/plan-import/parser.ts)): Expects `TASK:`, `TITLE:`, `BLOCKED_BY:`, etc. — a different format.
- **Import command** ([src/cli/import.ts](src/cli/import.ts)): Calls `parsePlanMarkdown` then `upsertTasksAndEdges`. Plan creation and task upsert already work.
- **Importer** ([src/plan-import/importer.ts](src/plan-import/importer.ts)): Expects `ParsedTask` with `stableKey`, `title`, `blockedBy`, etc. Reusable as-is if parser produces that shape.
- **AGENT.md** ([AGENT.md](AGENT.md)): Describes execution loop and blocking protocol, but no plan-review workflow.

---

## Cursor Plan Format (Input)

```yaml
---
name: Feature Name
overview: "Brief description."
todos:
  - id: task-1
    content: "Task title and description"
    status: pending
  - id: task-2
    content: "Another task"
    status: completed
    blockedBy: [task-1]   # optional, if Cursor adds it
isProject: false
---
```

Existing plans (e.g. [2026-02-26_00:33_task_graph_implementation_006e808b.md](2026-02-26_00:33_task_graph_implementation_006e808b.md)) use `id`, `content`, `status`. No `blockedBy` in current files — infer from content (e.g. "blocked by m0-scaffold") or add optional support for future format.

---

## Implementation Details

### 1. Cursor Parser

- Add `parseCursorPlan(filePath)` or extend parser to detect format.
- Parse YAML frontmatter (between `---` and `---`).
- Require `todos` array; each item: `id` (required), `content` (required), `status` (optional, default pending), `blockedBy` (optional).
- Map to `ParsedPlan`: `planTitle` = `name`, `planIntent` = `overview`, `tasks` = mapped todos.
- Map each todo to `ParsedTask`: `stableKey` = `id`, `title` = `content`, `blockedBy` = todo.`blockedBy` or `[]`, `acceptance` = `[]` unless we add it to schema.

### 2. Format Detection

- Option A: Add `--format cursor|legacy` to `tg import`; default `legacy` for backward compatibility.
- Option B: Auto-detect: if file starts with `---` and has `todos:` in first 50 lines, use Cursor parser.
- Prefer Option A for explicitness; Option B for convenience.

### 3. Status Mapping

- `completed` → set task `status = 'done'` on insert (or leave as todo and record in event? Simpler: insert as done if completed).
- `pending` or omitted → `status = 'todo'`.
- Other statuses (in progress, etc.): map to `todo` for now.

### 4. AGENT.md Additions

Add a new section **"Plan creation and review"**:

- When user asks for a plan: create `plans/<name>.md` in Cursor format, summarize, then ask for review.
- Pause. Do not import or execute until user responds.
- **Proceed** (phrases: proceed, go ahead, execute, run it, let's do it): Run `tg import plans/<file> --plan "<Plan Name>"` (with format flag if needed), then enter execution loop (`tg next` → ...).
- **Just add** (phrases: just add the tasks, add to taskgraph only): Run `tg import` only. Do not execute.
- **Stop** (phrases: thanks, that's good, looks good, ok, don't do anything): Do nothing. No import, no execution.

Include a small intent table for clarity.

---

## File Changes

| File | Change |
|------|--------|
| [src/plan-import/parser.ts](src/plan-import/parser.ts) | Add `parseCursorPlan()` or format branch; export shared `ParsedPlan` / `ParsedTask` shape |
| [src/cli/import.ts](src/cli/import.ts) | Add `--format cursor` option; call Cursor parser when selected |
| [package.json](package.json) | Add `js-yaml` or similar if not present for YAML parsing |
| [AGENT.md](AGENT.md) | Add plan-review workflow and intent table |
| [__tests__/plan-import/parser.test.ts](__tests__/plan-import/parser.test.ts) | Add tests for Cursor format |
| New: `__tests__/plan-import/cursor-format.test.ts` | Integration test: import real Cursor plan file |

---

## Dependencies

- YAML parsing: `js-yaml` is common. Check if already in tree; if not, add as dependency.
- No other new deps expected.

---

## Verification

1. Create a test plan `plans/test-cursor.md` in Cursor format.
2. Run `tg import plans/test-cursor.md --plan "Test Plan" --format cursor`.
3. Run `tg next --plan "Test Plan"` — should list runnable tasks.
4. Manually test agent workflow: create plan, say "proceed", confirm agent imports and executes.
5. Run `pnpm test` and `pnpm test:integration` from repo root.
