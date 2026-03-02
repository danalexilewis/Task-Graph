---
name: Strategic Planning Implementation
overview: Implement strategic planning mode, product analyst role, and multi-project plan format and import from reports/review-strategic-planning-2026-03-02.md.
fileTree: |
  .cursor/
  ├── agents/
  │   └── product-analyst.md          (create)
  ├── rules/
  │   └── available-agents.mdc        (modify)
  └── skills/
      └── plan/
          └── SKILL.md                (modify)
  docs/
  ├── leads/
  │   └── product-analyst.md          (create)
  ├── plan-format.md                  (modify)
  └── plan-import.md                  (modify)
  src/
  ├── cli/
  │   └── import.ts                   (modify)
  ├── plan-import/
  │   ├── parser.ts                   (modify)
  │   └── importer.ts                 (modify)
  __tests__/
  ├── plan-import/
  │   └── parser-multi-project.test.ts (create)
  └── integration/
  └── import-multi-project.test.ts   (create)
risks:
  - description: Parser change could break single-project import for edge-case YAML
    severity: medium
    mitigation: No change to single-plan path when projects key absent; add tests for both single and multi-project; keep frontmatterToParsedPlan unchanged for single-plan
  - description: Initiative resolution by title may match multiple or zero rows
    severity: low
    mitigation: Use single row or Unassigned; document that initiative must exist and have unique title for frontmatter
  - description: Product analyst is new role; orchestrator may under-use or over-use it
    severity: low
    mitigation: Lead doc and skill spell out when to dispatch; Strategic mode is opt-in via classification
tests:
  - "Parser returns single ParsedPlan for file without projects key (regression)"
  - "Parser returns ParsedStrategicPlan or equivalent for file with projects array"
  - "Import of multi-project file creates N project rows and assigns tasks to correct plan_id"
  - "Import of single-project file unchanged (no projects key) creates one project as today"
todos:
  - id: product-analyst-lead-agent
    content: Create product analyst lead doc and agent template and register in available-agents
    agent: documenter
    changeType: create
    intent: |
      Add docs/leads/product-analyst.md with purpose, input contract (initiative title/description, optional context), output contract (structured list of projects: name, overview, in-scope, out-of-scope, suggested order/dependencies; no full YAML; task-level only rough unless combined with planner-analyst). Add .cursor/agents/product-analyst.md with prompt template and same contract. Update .cursor/rules/available-agents.mdc to list product analyst with purpose and when to dispatch. Reference docs/leads/planner-analyst.md for parallel structure.
    docs: [plan-format, agent-contract]
  - id: multi-project-format-docs
    content: Document multi-project plan format and import behavior in plan-format and plan-import
    agent: documenter
    changeType: document
    intent: |
      In docs/plan-format.md add section for multi-project format: top-level projects array (each item has name, overview, todos; optional initiative at file level). State that absence of projects means single-project (current behavior). In docs/plan-import.md document import behavior for multi-project file: N project rows created/updated, initiative_id from frontmatter or --initiative, tasks upserted per project with correct plan_id. Backward compatibility: single-project plans unchanged.
    docs: [plan-format, plan-import]
  - id: strategic-mode-plan-skill
    content: Add Strategic mode to plan skill with classification, product analyst dispatch, and checklist
    agent: documenter
    changeType: modify
    blockedBy: [product-analyst-lead-agent]
    intent: |
      In .cursor/skills/plan/SKILL.md add Strategic as a scope-level mode in the mode table. Classification: trigger on initiative-level or multi-project phrases (plan the initiative, break down this initiative, multiple deliverables under X). Phase 1: dispatch product analyst for project boundaries (or initiative-level planner-analyst prompt). Phase 2: add strategic checklist (right project boundaries, each project one deliverable, cross-project deps clear, task counts reasonable). Output: multi-project plan format once parser supports it, or initiative doc pointing at N plan files. Update mode flowchart and any plan-authoring rule that references modes.
    docs: [plan-format, agent-contract]
  - id: parser-multi-project
    content: Add multi-project support to plan parser with backward-compatible single-project path
    agent: implementer
    changeType: modify
    blockedBy: [multi-project-format-docs]
    intent: |
      In src/plan-import/parser.ts when parsing Cursor frontmatter, if top-level key projects (array) is present, parse each element as a plan (name, overview, todos, optional fileTree/risks/tests per project). Add type ParsedStrategicPlan { initiative?: string; projects: ParsedPlan[] } or equivalent. Export parseCursorPlan so that when file has no projects key it returns the same single ParsedPlan as today (unchanged behavior). When file has projects key return the multi-project result (new function or union type so callers can branch). Reuse frontmatterToParsedPlan for each project item. Do not change frontmatterToParsedPlan signature or single-plan parsing. See docs/plan-format.md and docs/plan-import.md for canonical shape.
    docs: [plan-import]
    suggestedChanges: |
      After extracting frontmatter, check for raw.projects (array). If absent, keep current frontmatterToParsedPlan(parsed, filePath) and return. If present, map each item to frontmatterToParsedPlan shape and return ParsedStrategicPlan. Ensure CursorFrontmatter type allows optional projects.
  - id: importer-cli-multi-project
    content: Implement import command and importer for multi-project parse result and optional initiative from frontmatter
    agent: implementer
    changeType: modify
    blockedBy: [parser-multi-project]
    intent: |
      In src/cli/import.ts after parse, branch on result: if single ParsedPlan use existing flow (find-or-create one project, upsertTasksAndEdges). If multi-project (ParsedStrategicPlan or array), for each project find-or-create project row, resolve initiative_id from frontmatter initiative (title) or --initiative flag (ID or title), set project.initiative_id and optionally overview/objectives/outcomes/outputs from frontmatter, then call upsertTasksAndEdges(planId, tasks). Use existing upsertTasksAndEdges in src/plan-import/importer.ts (no signature change). Resolve initiative title to ID via query; fallback to Unassigned. Optionally in same pass populate overview etc. for single-project import when frontmatter has them (currently documented but not implemented). Add --initiative option to import command for single-project and multi-project.
    docs: [plan-import, schema]
  - id: export-multi-project-doc
    content: Document multi-project export behavior and optionally implement export for initiative
    agent: documenter
    changeType: document
    blockedBy: [importer-cli-multi-project]
    intent: |
      In docs/plan-format.md or docs/plan-import.md (or export section of cli-reference) document how export works for multi-project: either one exported file with N project sections (each section frontmatter + body) or one export per project. If implementing: in src/export/markdown.ts and src/cli/export.ts add option to export by initiative (e.g. --initiative <id> to export all projects in that initiative to one file or N files). Prefer doc-only for this task unless straightforward; implement in follow-up if needed.
    docs: [plan-format, cli-reference]
  - id: add-tests
    content: Add tests for parser multi-project and import multi-project and regression for single-project
    agent: implementer
    changeType: test
    blockedBy: [parser-multi-project, importer-cli-multi-project]
    intent: |
      Add __tests__/plan-import/parser-multi-project.test.ts: parse file with no projects key returns single ParsedPlan (regression); parse file with projects array returns ParsedStrategicPlan (or equivalent) with N items; each item has valid plan title and tasks. Add __tests__/integration/import-multi-project.test.ts or extend existing import test: import a multi-project plan file, assert N project rows created, tasks distributed to correct plan_id, initiative_id set when provided. Reuse existing integration test patterns (Dolt repo, config). Assign plan-level tests from the plan frontmatter to these tasks.
    docs: [testing, plan-import]
  - id: run-full-suite
    content: Run full test suite (pnpm gate:full) and record result in evidence
    agent: implementer
    changeType: test
    blockedBy: [add-tests]
    intent: |
      Run pnpm gate:full from repo root. Record result in tg done evidence (e.g. gate:full passed or gate:full failed with summary). On failure add tg note with failure reason.
isProject: false
---

# Strategic Planning Implementation

## Analysis

The review report (reports/review-strategic-planning-2026-03-02.md) recommends three tracks: (1) a **Strategic planning mode** for the plan skill so initiatives can be decomposed into multiple projects with tasks; (2) a **product analyst** sub-agent for initiative-to-project boundaries; (3) **multi-project plan format and import** so one plan file can define several projects and import creates N project rows with correct initiative and task assignment. The planner-analyst explored the codebase and confirmed: parser and import are single-plan today; schema already has initiative and project.initiative_id; extension points are classification in the skill, new product analyst files, parser branching on `projects:` key, and import loop when parse result is multi-project. Backward compatibility is preserved by leaving the single-plan path unchanged when `projects` is absent.

## Dependency graph

```
Parallel start (2 unblocked):
  ├── product-analyst-lead-agent (docs/leads + agent template + available-agents)
  └── multi-project-format-docs (plan-format.md, plan-import.md)

After product-analyst-lead-agent:
  └── strategic-mode-plan-skill (plan SKILL.md + classification + checklist)

After multi-project-format-docs:
  └── parser-multi-project (parser.ts types and parse path)

After parser-multi-project:
  └── importer-cli-multi-project (import.ts branch + initiative resolution)

After importer-cli-multi-project:
  └── export-multi-project-doc (document or implement export)

After parser-multi-project and importer-cli-multi-project:
  └── add-tests (parser + integration tests)

After add-tests:
  └── run-full-suite
```

## Key decisions

- **Single-plan path unchanged:** Parser and import do not modify behavior for files without a top-level `projects` key. All existing plans continue to import as one project.
- **Product analyst before strategic mode:** The plan skill needs the product analyst contract and agent file before it can reference and dispatch them in Strategic mode.
- **Format docs before parser:** plan-format.md and plan-import.md define the canonical multi-project shape so parser and import share one contract.
- **Export:** Document multi-project export first; implement in this plan only if straightforward (e.g. --initiative on export).

## Open questions

- Whether to add a dedicated `parseStrategicPlan` entrypoint or have `parseCursorPlan` return a union/discriminated type so import can branch without breaking template apply (which expects ParsedPlan). Analyst suggested wrapper or branch on `projects:`; template apply does not need multi-project.

<original_prompt>
/plan based on reports/review-strategic-planning-2026-03-02.md
</original_prompt>
