---
name: Project Rules
overview: "Establish Cursor rules and conventions for the Task-Graph repo—aligning agent behavior with the plan→taskgraph→execution workflow, code standards, and documentation. Meta: this plan creates tasks we execute against."
todos:
  - id: rules-taskgraph-workflow
    content: Create .cursor/rules/taskgraph-workflow.mdc — rules for plan creation, review protocol, tg import, and execution loop (tg next → show → start → done)
    status: completed
  - id: rules-plan-authoring
    content: Create .cursor/rules/plan-authoring.mdc — Cursor plan format (YAML todos with id, content, status, blockedBy), how to write good task dependencies
    status: completed
  - id: rules-code-standards
    content: Create .cursor/rules/code-standards.mdc — TypeScript in tools/taskgraph, neverthrow for errors, domain/db/cli layering
    status: completed
  - id: rules-docs-sync
    content: Create .cursor/rules/docs-sync.mdc — when to update docs/, AGENT.md vs agent-contract.md, CLI reference as source of truth
    status: completed
  - id: docs-update-plan-import
    content: Update docs/plan-import.md — add Cursor format (--format cursor), YAML frontmatter, status mapping
    status: completed
  - id: docs-update-cli-reference
    content: Update docs/cli-reference.md — add --format cursor to tg import, document plan list if added
    status: completed
  - id: docs-update-agent-contract
    content: Update docs/agent-contract.md — add Plan creation and review section, align with AGENT.md
    status: completed
  - id: docs-update-readme
    content: Update docs/README.md — mention pnpm tg, root package.json, link to Cursor format
    status: completed
isProject: false
---

# Project Rules Plan

## Goal

Define Cursor rules (`.cursor/rules/`) that codify how agents and humans interact with the Task-Graph system. Rules should reinforce: plans in `plans/` → import to Dolt via `tg import --format cursor` → execute via `tg next` / `tg start` / `tg done`. We also need to bring docs up to date with recent changes (Cursor format importer, plan-review workflow).

## Current State

- **AGENT.md**: Has plan-review workflow and intent table (proceed/thanks/just add). Source of truth for agent behavior.
- **docs/agent-contract.md**: More verbose version; does not include plan creation/review. Out of sync.
- **docs/plan-import.md**: Documents only legacy format (TASK:/TITLE:/BLOCKED_BY:). Missing Cursor format.
- **docs/cli-reference.md**: Does not document `--format cursor` on `tg import`.
- **docs/README.md**: Quick start uses `tg` directly; repo uses `pnpm tg` from root.
- **.cursor/rules/**: Does not exist. No project-specific rules yet.

## Rule Categories

### 1. Taskgraph Workflow

When to create plans, when to pause for review, how to interpret user responses, and the execution loop.

**Key behaviors:**
- Plans go in `plans/<name>.plan.md` in Cursor format.
- Pause after creating a plan; do not import or execute until user responds.
- "Proceed" → import + execute. "Thanks" → acknowledge only. "Just add tasks" → import only.
- Execution: `tg next` → `tg show <id>` → `tg start <id>` → work → `tg done <id> --evidence "..."`.

### 2. Plan Authoring

How to write plans that import cleanly into taskgraph.

**Key behaviors:**
- Use Cursor format: YAML frontmatter with `name`, `overview`, `todos`.
- Each todo: `id` (stable key), `content` (title), `status` (pending/completed), optional `blockedBy`.
- Use `blockedBy` for dependencies so edges are created on import.
- Keep task titles scoped; split if >~90 min estimate.

### 3. Code Standards

Conventions for `tools/taskgraph/` and related code.

**Key behaviors:**
- TypeScript, neverthrow for errors, Zod for validation.
- Layering: db → domain → cli. No direct doltSql in cli.
- Tests: unit in `__tests__/`, integration in `__tests__/integration/`, e2e in `__tests__/e2e/`.

### 4. Docs Sync

When and how to update documentation.

**Key behaviors:**
- `AGENT.md` is the canonical agent contract; sync `docs/agent-contract.md` when AGENT.md changes.
- `docs/cli-reference.md` must stay in sync with CLI commands and options.
- New features that change user/agent behavior → update relevant docs in same PR.

## Docs Updates Required

| Doc | Gap | Fix |
|-----|-----|-----|
| docs/plan-import.md | No Cursor format | Add section on YAML frontmatter, `--format cursor`, status mapping |
| docs/cli-reference.md | tg import missing --format | Document `--format legacy|cursor` |
| docs/agent-contract.md | No plan-review | Add Plan creation and review, align with AGENT.md |
| docs/README.md | Assumes `tg` in PATH | Mention `pnpm tg`, root package.json |

## Deliverables

1. **.cursor/rules/taskgraph-workflow.mdc** — Plan creation, review, import, execution.
2. **.cursor/rules/plan-authoring.mdc** — Cursor plan format and dependency best practices.
3. **.cursor/rules/code-standards.mdc** — TypeScript, neverthrow, layering.
4. **.cursor/rules/docs-sync.mdc** — Documentation update protocol.
5. **Updated docs/** — plan-import, cli-reference, agent-contract, README.
