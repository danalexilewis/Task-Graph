---
name: Cursor Sub-Agent Specialization System
overview: |
  Create a collection of specialized sub-agent definitions for Cursor that use
  model="fast" (1/10 cost) for all dispatched work. The orchestrator (session model)
  handles reasoning and coordination; sub-agents handle bounded execution tasks.
  Better prompts with tight context (from tg context) compensate for cheaper models.

  Inspired by gt-toolkit's formula system (multi-model dispatch, context isolation,
  file-based handoffs) and superpowers' skill-driven subagent pattern (implementer +
  reviewer, fresh context per task).

  Three layers of value:
  1. Parallel task dispatch — orchestrator finds unblocked tasks via `tg next`,
     dispatches multiple fast sub-agents concurrently on independent work items.
     This is the primary performance win: multiple cheap agents working in parallel
     on non-dependent tasks from Dolt.
  2. Cheap execution — ALL sub-agents use model="fast". The quality comes from
     well-scoped prompts with full tg context injected, not from model tier.
     The orchestrator (expensive session model) only does coordination and review.
  3. Planning analysis — a fast sub-agent explores the codebase and gathers context
     before the expensive orchestrator writes or reviews the plan.

  Sub-agents are prompt templates (.md files) living in `.cursor/agents/`.
  The orchestrating agent (or the workflow rules) reference them when dispatching
  via Cursor's Task tool with model="fast".
todos:
  - id: create-explorer-agent
    content: Create the Explorer sub-agent (fast model, codebase analysis)
    status: completed
    blockedBy:
      - design-agent-format
    domain:
      - backend
  - id: design-agent-format
    content: Design the sub-agent definition format and directory structure
    status: completed
    domain:
      - backend
    skill:
      - plan-authoring
  - id: create-dispatcher-rule
    content: Create the sub-agent dispatch rule and skill guide
    status: completed
    blockedBy:
      - create-explorer-agent
      - create-planner-analyst-agent
      - create-reviewer-agent
      - create-implementer-agent
    domain:
      - backend
    skill:
      - plan-authoring
  - id: create-planner-analyst-agent
    content: Create the Planner Analyst sub-agent (fast model, pre-plan exploration)
    status: completed
    blockedBy:
      - design-agent-format
    domain:
      - backend
    skill:
      - plan-authoring
  - id: update-workflow-rule
    content: Update taskgraph-workflow.mdc to reference sub-agent dispatch
    status: completed
    blockedBy:
      - create-dispatcher-rule
    domain:
      - backend
  - id: add-agents-to-template
    content: Add agent definitions to src/template for tg setup scaffolding
    status: completed
    blockedBy:
      - update-workflow-rule
    domain:
      - backend
    skill:
      - cli-command-implementation
  - id: create-reviewer-agent
    content: Create the Reviewer sub-agent (fast model, spec compliance check)
    status: completed
    blockedBy:
      - design-agent-format
    domain:
      - backend
  - id: create-implementer-agent
    content: Create the Implementer sub-agent (fast model, task execution)
    status: completed
    blockedBy:
      - design-agent-format
    domain:
      - backend
isProject: false
---
