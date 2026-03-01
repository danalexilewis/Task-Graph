---
name: Improve Docs Compliance and System Health
overview: Implement recommendations from the review report to enhance documentation compliance and operational system health.
fileTree: |
  docs/
  ├── architecture.md             (modify)
  ├── schema.md                   (modify)
  ├── cli-reference.md            (modify)
  ├── cli.md                      (modify)
  ├── cli-tables.md               (modify)
  ├── plan-import.md              (modify)
  ├── plan-format.md              (modify)
  ├── error-handling.md           (modify)
  ├── testing.md                  (modify)
  ├── infra.md                    (modify)
  ├── agent-contract.md           (modify)
  ├── agent-strategy.md           (modify)
  ├── multi-agent.md              (modify)
  ├── mcp.md                      (modify)
  ├── glossary.md                 (modify)
  ├── backend.md                  (modify)
  ├── recommended-packages.md     (modify)
  ├── README.md                   (modify)
  ├── domains.md                  (modify)
  reports/
  └── review-2025-03-01.md        (read only)
risks:
  - description: Incorrectly implementing triggers frontmatter could break doc-skill registry or parsing.
    severity: medium
    mitigation: Thoroughly test frontmatter with `pnpm tg import` (if applicable) and manually verify rendering.
  - description: Overlooking dependencies when updating documentation could lead to inconsistencies.
    severity: low
    mitigation: Cross-reference `docs/domains.md` and `docs/README.md` during all doc updates.
  - description: Dolt/migration issues could prevent operational health checks from running.
    severity: high
    mitigation: Prioritize documenting and resolving the underlying Dolt/migration issue.
tests:
  - "Verify updated documentation renders correctly and has expected frontmatter."
  - "Confirm `pnpm tg status --tasks` runs without Dolt errors after infra docs are updated."
todos:
  - id: add-triggers-frontmatter
    content: "Add triggers frontmatter to domain docs"
    agent: implementer
    intent: |
      Add YAML frontmatter with `triggers.files`, `triggers.change_types`, and `triggers.keywords` to:
      - `docs/plan-format.md`
      - `docs/multi-agent.md`
      - `docs/mcp.md`
      - `docs/glossary.md` (and fix body to start with # Title)
      - `docs/backend.md`
      - `docs/recommended-packages.md`
      Ensure correct YAML syntax and blank line before `# Title`.
    changeType: modify
    docs: [markdown-format, documentation-strategy]
  - id: add-purpose-sections
    content: "Add 'Purpose' sections to domain docs"
    agent: implementer
    intent: |
      Add a "Purpose" section (explicitly stating what the doc owns and optionally what it does not own) to:
      - `docs/architecture.md`
      - `docs/schema.md`
      - `docs/cli-reference.md`
      - `docs/cli.md`
      - `docs/cli-tables.md`
      - `docs/plan-import.md`
      - `docs/plan-format.md`
      - `docs/error-handling.md`
      - `docs/testing.md`
      - `docs/agent-contract.md`
      - `docs/agent-strategy.md`
      - `docs/mcp.md`
      - `docs/glossary.md`
      - `docs/recommended-packages.md`
    changeType: modify
    docs: [documentation-strategy]
  - id: add-decisions-gotchas-sections
    content: "Add 'Decisions / gotchas' sections to domain docs"
    agent: implementer
    intent: |
      Add a "Decisions / gotchas" section (for design decisions and "why") to:
      - `docs/architecture.md`
      - `docs/cli-reference.md`
      - `docs/cli.md`
      - `docs/cli-tables.md`
      - `docs/plan-format.md`
      - `docs/error-handling.md`
      - `docs/agent-strategy.md`
      - `docs/multi-agent.md`
      - `docs/mcp.md`
      - `docs/recommended-packages.md`
      Consider renaming or splitting `docs/agent-contract.md`'s "Decisions" section to clarify its purpose.
    changeType: modify
    docs: [documentation-strategy]
  - id: add-related-projects-sections
    content: "Add 'Related projects' sections to domain docs"
    agent: implementer
    intent: |
      Add a "Related projects" section (listing task-graph project titles that changed the domain) to:
      - `docs/architecture.md`
      - `docs/cli-reference.md`
      - `docs/cli.md`
      - `docs/cli-tables.md`
      - `docs/plan-import.md`
      - `docs/plan-format.md`
      - `docs/error-handling.md`
      - `docs/agent-contract.md`
      - `docs/agent-strategy.md`
      - `docs/multi-agent.md`
      - `docs/mcp.md`
      - `docs/glossary.md`
      - `docs/recommended-packages.md`
    changeType: modify
    docs: [documentation-strategy]
  - id: align-doc-indices
    content: "Align documentation indices (README and domains.md)"
    agent: implementer
    intent: |
      - Add `docs/cursor-agent-cli.md` to `docs/domains.md` if it should be a domain slug, or leave it as reference-only in `docs/README.md` and add a note.
      - Add a "Lead docs" link in `docs/README.md` to `docs/leads/README.md`.
    changeType: modify
    docs: [documentation-strategy]
  - id: document-dolt-migration-requirement
    content: "Document Dolt/migration requirement in docs/infra.md"
    agent: implementer
    intent: |
      In `docs/infra.md`, document that all `tg` commands (except `init`/`setup`) require a working Dolt repo and successful migration. Explain that "Dolt SQL query failed" typically means Dolt is missing, the repo is not initialized, or (in server mode) the server is not running.
    changeType: modify
    docs: [infra, documentation-strategy]
  - id: clarify-schema-doc-vs-project-table
    content: "Clarify schema doc vs project table in docs/schema.md"
    agent: implementer
    intent: |
      In `docs/schema.md`, add a note that the persisted table is `project`, `plan` is a view, and migration details are in `src/db/migrate.ts`.
    changeType: modify
    docs: [schema, documentation-strategy]
  - id: audit-task-graph-state
    content: "Audit task graph state (when CLI is usable)"
    agent: implementer
    blockedBy: [document-dolt-migration-requirement]
    intent: |
      Once the `tg` CLI is usable (Dolt/migration issues resolved and documented), run `pnpm tg status --tasks` to audit for stale `doing` tasks, orphaned or blocked tasks, and plan completion. Resolve any inconsistencies using `tg done --force` or `tg note`. For completed plans, run `pnpm tg export markdown --plan <planId>`.
    changeType: investigate
    docs: [taskgraph-workflow]
  - id: review-error-handling-doc-structure
    content: "Review and restructure error-handling.md"
    agent: implementer
    intent: |
      Review `docs/error-handling.md` to improve scannability. Consider adding a short "Purpose" and a "Decisions / gotchas" section, and converting some narrative prose into bullets or a small table where appropriate.
    changeType: modify
    docs: [documentation-strategy, error-handling]
---

## Analysis

The plan is structured to address the recommendations from the review report (`reports/review-2025-03-01.md`). The tasks are categorized to address docs compliance (frontmatter, sections, index alignment) and system health operational follow-up (Dolt documentation, schema clarification, task graph audit).

The plan prioritizes documentation updates that enable the doc-skill registry (adding `triggers` frontmatter) and improve human/agent readability (Purpose, Decisions/gotchas, Related projects sections). Operational health tasks are also included, with a dependency on documenting the Dolt/migration requirement before auditing the task graph.

I've also included a task to review `error-handling.md` to improve its structure and scannability, as noted in the initial review.

## Dependency graph

Parallel start (6 unblocked):
├── add-triggers-frontmatter (Add triggers frontmatter to domain docs)
├── add-purpose-sections (Add 'Purpose' sections to domain docs)
├── add-decisions-gotchas-sections (Add 'Decisions / gotchas' sections to domain docs)
├── add-related-projects-sections (Add 'Related projects' sections to domain docs)
├── align-doc-indices (Align documentation indices (README and domains.md))
└── document-dolt-migration-requirement (Document Dolt/migration requirement in docs/infra.md)
└── review-error-handling-doc-structure (Review and restructure error-handling.md)

After document-dolt-migration-requirement:
└── audit-task-graph-state (Audit task graph state (when CLI is usable))

After all above:
└── clarify-schema-doc-vs-project-table (Clarify schema doc vs project table in docs/schema.md)

## Proposed changes

The changes will primarily involve editing existing Markdown files in the `docs/` directory.

- **Frontmatter**: Add YAML frontmatter to files that are missing it, ensuring the `triggers` block is present and correctly formatted.
- **Section additions**: Add "Purpose", "Decisions / gotchas", and "Related projects" sections to various domain documentation files, populating them with relevant content where possible, or adding placeholders for future expansion.
- **Index alignment**: Modify `docs/README.md` and `docs/domains.md` to ensure consistency and proper linking of lead documentation.
- **Infrastructure documentation**: Update `docs/infra.md` to clearly outline the Dolt/migration prerequisites for running `tg` commands.
- **Schema clarification**: Add a note to `docs/schema.md` to clarify the relationship between the `plan` view and the `project` table.
- **Error handling structure**: Refactor `docs/error-handling.md` for better readability.

## Open questions

- The specific content for "Decisions / gotchas" and "Related projects" sections will need to be gathered from historical context or discussions. For now, the tasks will add the sections, and they can be populated later.
- The `audit-task-graph-state` task is dependent on the Dolt/migration issues being resolved, which might require further investigation and potentially separate tasks outside this plan.

<original_prompt>
make a plan to implement these recomendations
</original_prompt>
