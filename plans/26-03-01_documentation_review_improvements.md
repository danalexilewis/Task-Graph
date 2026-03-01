---
name: Documentation Review Improvements
overview: Implement the five high-impact doc recommendations from reports/review-2026-03-01.md so the system narrative, key flows, and domain map are clearly documented with Mermaid where helpful.
fileTree: |
  docs/
  ├── overview.md                  (create)
  ├── README.md                    (modify)
  ├── domains.md                  (modify)
  ├── architecture.md             (reference only)
  ├── schema.md                   (modify)
  ├── glossary.md                 (reference only)
  ├── agent-contract.md           (modify)
  ├── agent-strategy.md          (modify)
  ├── multi-agent.md             (modify)
  └── leads/
      └── README.md              (reference only)
  reports/
  └── review-2026-03-01.md       (source)
risks:
  - description: Overview or new sections could drift from existing prose if not cross-linked carefully.
    severity: low
    mitigation: Each new section links to and from existing docs; documenter follows report insertion points.
tests: []
todos:
  - id: overview-narrative
    content: Add docs/overview.md with How the system works narrative
    agent: documenter
    intent: |
      Create docs/overview.md as the single-page system story. Four parts: (1) Entrypoints (CLI, MCP), (2) Data (Dolt; project, task, edge, event tables), (3) Main flows (plan file to import to project; next to start to work to done; skill to lead to workers; worktrees and merge), (4) Outcomes (done tasks, export, gate). Link to architecture.md, schema.md, agent-contract.md, multi-agent.md. Add link from docs/README.md in Overview or Core. If frontmatter is added for doc-skill-registry, use triggers with files/keywords for overview. Keep under ~150 lines so it stays scannable.
    changeType: create
  - id: worktree-merge-mermaid
    content: Add worktree and merge flow Mermaid to docs/multi-agent.md
    agent: documenter
    intent: |
      In docs/multi-agent.md add a new subsection "Worktree and merge flow" after "Parallel task handling" and before "Backend selection". Insert one Mermaid flowchart showing: main branch; plan branch (plan-p-*); task branches (tg-*); tg start --worktree (create or reuse plan worktree, create task worktree from plan branch); tg done --merge (task branch merges into plan branch); optional "plan complete" step (plan branch merges to main). Match existing Mermaid style (flowchart, subgraphs if needed). Keep prose above or below the diagram to tie to existing Worktrunk section.
    changeType: modify
  - id: state-machine-mermaid
    content: Add task and project state machine Mermaid to docs/schema.md
    agent: documenter
    intent: |
      In docs/schema.md add a new subsection "Task and project state machine" before "## ENUM reference". Use Mermaid stateDiagram or flowchart: task states (todo, doing, blocked, done, canceled) and project states (draft, active; add paused/done/abandoned only if they exist in schema). Show allowed transitions: start (todo to doing), done (doing to done), block (to blocked), cancel (to canceled), and project draft to active on first tg start or import when project has doing/done tasks. Align with schema.md table status columns and glossary.md execution terms.
    changeType: modify
  - id: execution-loop-subsection
    content: Add execution loop reference subsection to docs/agent-contract.md
    agent: documenter
    intent: |
      In docs/agent-contract.md add a single subsection that is the one-place reference for the execution loop. Place after "Agent Operating Loop" (after step 5) and before "General context at start". Content: (1) Steps: next, show, start [--agent] [--worktree], work, done [--merge] --evidence. (2) Rules: "tg done from repo root" (cite taskgraph-workflow.mdc); "gate:full from plan worktree after tasks merged" (cross-link to existing gate:full Orchestration Rules in same doc); "WORKTREE_PATH for implementer" (cite subagent-dispatch.mdc). Optionally add a small Mermaid flowchart (next to show to start to work to done). Do not duplicate the full Operating Loop; either expand that section with these rules or add "Execution loop (reference)" as a sibling subsection.
    changeType: modify
  - id: agent-domain-map
    content: Tighten agent-domain map in docs/README.md and docs/domains.md
    agent: documenter
    intent: |
      (1) In docs/README.md under the Agent bullet list (or a short "Agent system index" subheading): state that the agent system is documented in AGENT.md (canonical contract), agent-contract.md, agent-strategy.md, multi-agent.md, and docs/leads/ (lead registry and per-lead docs). Add one sentence and links. (2) In docs/domains.md add a note below the table or a new table row: agent contract and workflow live in AGENT.md, agent-contract.md, agent-strategy.md, multi-agent.md, and docs/leads/. If adding a row, use a slug like agent-system and description "Agent contract, workflow, and lead registry" with doc as the list or a single pointer doc.
    changeType: modify
  - id: skill-lead-worker-mermaid
    content: Add generic Skill to lead to worker Mermaid to docs/agent-strategy.md
    agent: documenter
    intent: |
      In docs/agent-strategy.md add a new subsection "Skill to lead to worker flow" after "Decision Tree" and before "File Layout". Insert one Mermaid flowchart: User input to skill (trigger) to lead to dispatch worker(s) to worker runs to result to lead synthesizes to orchestrator. This is the generic pattern; per-skill decision trees in .cursor/skills remain. Match existing Mermaid style in README and architecture. Keep the diagram compact so the rest of the doc stays readable.
    changeType: modify
isProject: false
---

## Analysis

The documentation review (reports/review-2026-03-01.md) identified that the system narrative, key flows, and domain map are spread across several docs. The report recommended five high-impact changes: one consolidated "How the system works" narrative, two Mermaid diagrams (worktree/merge and task/project state machine), one execution-loop reference with worktree and gate:full rules, a clear agent-domain index, and a generic skill-to-lead-to-worker diagram. All work is documentation-only; no code or schema changes. The planner-analyst confirmed exact insertion points and that all six tasks are independent, so they can run in parallel.

## Dependency graph

All tasks are independent; no blockedBy. Two waves of three in parallel is feasible.

```
Parallel (all unblocked):
  ├── overview-narrative
  ├── worktree-merge-mermaid
  └── state-machine-mermaid

Parallel (same wave):
  ├── execution-loop-subsection
  ├── agent-domain-map
  └── skill-lead-worker-mermaid
```

## Proposed changes

- **overview-narrative:** New docs/overview.md with four-part narrative; link from docs/README.
- **worktree-merge-mermaid:** One flowchart in multi-agent.md under new subsection after "Parallel task handling".
- **state-machine-mermaid:** One state diagram in schema.md before ENUM reference.
- **execution-loop-subsection:** One subsection in agent-contract.md with steps, three rules, optional small Mermaid.
- **agent-domain-map:** Short agent index in docs/README; note or row in domains.md.
- **skill-lead-worker-mermaid:** One flowchart in agent-strategy.md after "Decision Tree".

## Open questions

- None. Report and analyst specified insertion points and preferred locations (overview as new file, state machine in schema, skill diagram in agent-strategy).

<original_prompt>
Plan based on the report (reports/review-2026-03-01.md). Implement the five high-impact documentation recommendations.
</original_prompt>
