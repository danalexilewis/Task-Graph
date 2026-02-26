---
name: Meta-Planning Skills
overview: Create two invokable skills for cross-plan risk assessment and pattern-based task enrichment in Dolt.
fileTree: |
  .cursor/skills/assess-risk/SKILL.md               (create)
  .cursor/skills/assess-risk/CODE_RISK_ASSESSMENT.md (create)
  .cursor/skills/pattern-tasks/SKILL.md              (create)
  src/cli/crossplan.ts                               (create)
  src/cli/index.ts                                   (modify)
  docs/cli-reference.md                              (modify)
  __tests__/integration/crossplan.test.ts             (create)
risks:
  - description: Pattern-tasks skill writes edges to Dolt and could create incorrect cross-plan dependencies
    severity: medium
    mitigation: All proposed edges shown to user for approval before writing; use relates edges (not blocks) by default
  - description: Risk assessment is subjective and model-dependent
    severity: low
    mitigation: Framework is structured with explicit metrics; output is advisory, not automated
  - description: Cross-plan queries may be slow with many tasks
    severity: low
    mitigation: 61 tasks is small; queries are simple aggregations
tests:
  - "tg crossplan domains shows domain overlap across plans"
  - "tg crossplan files shows file_tree overlap across plans"
  - "tg crossplan edges --dry-run proposes edges without writing"
  - "tg crossplan edges writes relates edges to Dolt when confirmed"
  - "assess-risk skill produces structured risk report for loaded plans"
  - "pattern-tasks skill enriches tasks and proposes cross-plan edges"
todos:
  - id: crossplan-cli
    content: "Add tg crossplan command for cross-plan analysis queries"
    intent: |
      New CLI command with subcommands that the skills will invoke:

      tg crossplan domains [--json]: Show domains shared across multiple plans with task counts.
      Groups tasks by domain, lists which plans each domain appears in.

      tg crossplan skills [--json]: Same for skills.

      tg crossplan files [--json]: Parse file_tree from each plan, find files touched by
      multiple plans. This is the key signal for ordering — if Plan A and Plan B both modify
      src/cli/start.ts, one should go first.

      tg crossplan edges [--dry-run] [--json]: Propose new cross-plan edges. Logic:
      1. Find tasks in different plans that share the same domain
      2. Find tasks in different plans whose file_tree entries overlap
      3. For file overlaps: propose a blocks edge (the plan with fewer deps should go first)
      4. For domain overlaps: propose a relates edge (informational)
      5. --dry-run shows proposals without writing. Without --dry-run, writes to Dolt.

      tg crossplan summary [--json]: All of the above in one output — domains, skills,
      file overlaps, proposed edges. This is what the skills will invoke.
    suggestedChanges: |
      // File overlap detection from plan.file_tree
      function parseFileTree(fileTree: string): string[] {
        return fileTree.split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.endsWith('/'))
          .map(l => l.replace(/\s+\((?:create|modify)\)$/, ''));
      }

      // Cross-plan file overlap query
      SELECT p1.title as plan_a, p2.title as plan_b, p1.file_tree, p2.file_tree
      FROM plan p1, plan p2
      WHERE p1.plan_id < p2.plan_id AND p1.file_tree IS NOT NULL AND p2.file_tree IS NOT NULL
    changeType: create
    domain: [cli]
    skill: [cli-command-implementation]
  - id: crossplan-tests
    content: "Integration tests for tg crossplan command"
    intent: |
      Create multiple plans with overlapping domains and file trees.
      Verify crossplan domains, skills, files, and edges outputs.
      Test --dry-run does not write. Test edge creation does write.
    blockedBy: [crossplan-cli]
    changeType: test
    skill: [integration-testing]
  - id: assess-risk-skill
    content: "Create assess-risk skill for Greg's risk assessment framework"
    intent: |
      Create .cursor/skills/assess-risk/SKILL.md — an invokable skill that:
      1. Reads all plans and tasks from Dolt via tg crossplan summary --json
      2. For each plan, rates the 8 risk metrics (Entropy, Surface Area, Backwards Compat,
         Reversibility, Complexity Concentration, Testing Surface, Performance Risk, Blast Radius)
      3. Considers cross-plan interactions (e.g. two plans modifying the same file elevates
         Complexity Concentration risk)
      4. Produces a structured risk report using the template from the user's framework
      5. Ends with a prioritized risk summary and recommended execution order

      Also create CODE_RISK_ASSESSMENT.md with Greg's full framework as reference.

      The skill is READ-ONLY — it queries Dolt but does not modify it.

      Workflow: user says "assess risk" or "run risk assessment" → skill activates →
      agent runs tg crossplan summary, reads plan files, produces report.
    changeType: create
  - id: pattern-tasks-skill
    content: "Create pattern-tasks skill for cross-plan task enrichment"
    intent: |
      Create .cursor/skills/pattern-tasks/SKILL.md — an invokable skill that:
      1. Reads all plans and tasks from Dolt via tg crossplan summary --json
      2. Identifies patterns:
         a. File conflicts: tasks from different plans touching the same files → proposes
            blocks edges with rationale
         b. Domain clusters: tasks sharing domains across plans → proposes relates edges
         c. Architectural opportunities: tasks in multiple plans that could share a common
            abstraction (e.g. 5 plans all add CLI commands → suggest a CLI scaffolding task)
         d. Ordering opportunities: which plans should execute first to unblock others
            (e.g. Short Hash IDs would benefit all other plans if done first)
      3. Presents findings to the user with proposed actions
      4. On approval, writes edges to Dolt via tg edge add and enriches tasks via tg note

      The skill WRITES to Dolt — but only after presenting proposals and getting approval.

      Workflow: user says "find patterns" or "enrich tasks" → skill activates →
      agent runs analysis, presents proposals, user approves, agent writes to Dolt.
    changeType: create
  - id: update-cli-docs
    content: "Document tg crossplan command in cli-reference.md"
    intent: |
      Add crossplan command and subcommands to cli-reference.md.
      Document the query logic and edge proposal algorithm.
    blockedBy: [crossplan-cli]
    changeType: document
    skill: [documentation-sync]
isProject: false
---

## Analysis

We have 61 tasks across 10 plans loaded in Dolt. Before executing, there's a valuable meta-planning
step: understanding how plans interact, where they conflict, and what order minimizes friction.

### Current infrastructure

`tg portfolio overlaps` and `tg portfolio hotspots` exist but work on `feature_key` and `area` —
neither of which our new plans use heavily. The cross-plan analysis needs to work on **domains**,
**skills**, and **file_tree** overlaps, which are the dimensions our plans actually populate.

### Data landscape (current 61 tasks)

**Domain hotspots**: `cli` appears in 9/10 plans (18 tasks). `schema` in 3 plans (5 tasks).
**Skill hotspots**: `documentation-sync` in all 10 plans (12 tasks). `cli-command-implementation`
in 8 plans (11 tasks). `integration-testing` in 8 plans (8 tasks).

This tells us:

- Doc tasks across plans could potentially be batched
- CLI command tasks share conventions and should reference each other
- Schema tasks (hash IDs, gates, branches) have ordering implications

### The two skills

**assess-risk** (read-only): Applies Greg's structured risk framework to the loaded plans.
Produces a per-plan risk matrix and a cross-plan interaction analysis. Intended to run first.

**pattern-tasks** (read-write): Enriches the task graph with cross-plan edges and notes.
Finds file overlaps, domain clusters, architectural opportunities, and optimal execution order.
Runs after risk assessment, armed with risk context.

### Why a `tg crossplan` CLI command?

The skills are agent instructions — they tell the agent _what_ to do. But the agent needs _data_
to work with. Rather than having the agent compose raw SQL queries each time, a `tg crossplan`
command provides a stable, tested interface for cross-plan analysis. The skills invoke it.

```mermaid
graph LR
  User -->|"assess risk"| A[assess-risk skill]
  User -->|"find patterns"| B[pattern-tasks skill]
  A -->|reads| C[tg crossplan summary]
  B -->|reads| C
  B -->|writes| D[tg edge add / tg note]
  C -->|queries| E[Dolt DB]
  D -->|mutates| E
```

### Typical workflow

1. Load plans → `tg import` (done)
2. Risk assessment → invoke assess-risk skill → produces report
3. Pattern recognition → invoke pattern-tasks skill → proposes and writes edges
4. Execute → begin task execution with enriched graph

<original_prompt>
Create two invokable skills:

1. assess-risk — Greg's risk assessment framework applied to loaded plans (read-only)
2. pattern-tasks — Cross-plan task enrichment: find overlaps, propose edges, enrich tasks (read-write)
   Plus a tg crossplan CLI command to support both skills with structured cross-plan queries.
   </original_prompt>
