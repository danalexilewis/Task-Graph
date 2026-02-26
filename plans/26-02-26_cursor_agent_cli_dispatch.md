---
name: Cursor Agent CLI for Sub-Agent Dispatch
overview: Document all dispatch mechanisms (Task tool, agent CLI, mcp_task) and update subagent rules so the orchestrator chooses by what is available.
todos:
  - id: doc-cursor-agent-cli
    content: Add docs/cursor-agent-cli.md with help output and all dispatch mechanisms
    status: pending
  - id: update-dispatch-rule
    content: Update subagent-dispatch.mdc with Task tool, agent CLI, and mcp_task options
    status: pending
    blockedBy: [doc-cursor-agent-cli]
  - id: update-agent-md
    content: Update AGENT.md to reference agent CLI for dispatch
    status: pending
    blockedBy: [doc-cursor-agent-cli]
  - id: update-skill-doc
    content: Update docs/skills/subagent-dispatch.md with agent CLI
    status: pending
    blockedBy: [doc-cursor-agent-cli]
  - id: update-agents-readme
    content: Update .cursor/agents/README.md with agent CLI dispatch option
    status: pending
    blockedBy: [doc-cursor-agent-cli]
  - id: sync-template
    content: Sync all dispatch and doc changes to src/template
    status: pending
    blockedBy: [update-dispatch-rule, update-agent-md, update-skill-doc, update-agents-readme]
  - id: link-docs-readme
    content: Add link to docs/cursor-agent-cli.md in docs/README.md
    status: pending
    blockedBy: [doc-cursor-agent-cli]
isProject: false
---

## Context

Dispatch is defined by the same prompt and workflow; the **mechanism** depends on what is available. Three options: (1) **In-IDE**: Cursor Task tool with model=fast. (2) **Terminal**: `agent` CLI with --print --trust. (3) **This environment**: mcp_task with the same built prompt and a short description (e.g. "Implement task: &lt;title&gt;"). We need to document all three and update the dispatch rule so the orchestrator uses whichever is available (no falling back to direct execution just because the Task tool is not visible).

## Task intents

### doc-cursor-agent-cli
Ensure `docs/cursor-agent-cli.md` covers all three dispatch mechanisms: (1) In-IDE Task tool with model=fast. (2) Terminal: `agent --model <model> --print --trust` with same prompt; document help output, finding fast model, long prompts. (3) This environment: mcp_task with same prompt and description (e.g. "Implement task: &lt;title&gt;"); build prompt from same templates and context. Dispatch is the same workflow; choose mechanism by what is available.

### update-dispatch-rule
In `.cursor/rules/subagent-dispatch.mdc`: add a **Dispatch mechanisms** section. (1) In-IDE / terminal: use Cursor Task tool or `agent` CLI when available (link to docs/cursor-agent-cli.md). (2) This environment: use mcp_task with the same built prompt and a short description (e.g. "Implement task: &lt;title&gt;" or "Planner analyst: gather context for plan"); subagent_type generalPurpose or explore as appropriate. Prompt and workflow are unchanged; only the invocation differs. Do not skip dispatch because the Task tool is not visible — use mcp_task.

### update-agent-md
In `AGENT.md`, where we say "dispatch one Task with model=fast" (planning and execution): add that the same can be done via the `agent` CLI or, in environments where the Task tool is not available, via mcp_task with the same prompt; see `docs/cursor-agent-cli.md` and subagent-dispatch.mdc.

### update-skill-doc
In `docs/skills/subagent-dispatch.md`: add that sub-agents can be run via Task tool, `agent` CLI, or mcp_task (when in an environment that provides it); same prompt and workflow; reference `docs/cursor-agent-cli.md`.

### update-agents-readme
In `.cursor/agents/README.md`, "How dispatch works": add that the orchestrator may call the Task tool, run `agent --model ... --print --trust ...`, or use mcp_task with the same built prompt; link to `docs/cursor-agent-cli.md`.

### sync-template
Apply the same edits to `src/template/`: subagent-dispatch.mdc, AGENT.md, docs/skills/subagent-dispatch.md, .cursor/agents/README.md. Copy or update `docs/cursor-agent-cli.md` into `src/template/docs/` if template has its own docs copy. Ensure `tg setup` delivers the CLI-based dispatch story.

### link-docs-readme
In `docs/README.md`, under "For more detailed information" (or a Tooling subsection), add a link to `docs/cursor-agent-cli.md`.

## File tree

- docs/cursor-agent-cli.md (create)
- docs/README.md (modify)
- .cursor/rules/subagent-dispatch.mdc (modify)
- AGENT.md (modify)
- docs/skills/subagent-dispatch.md (modify)
- .cursor/agents/README.md (modify)
- src/template/ copies of the above (modify)

## Dependencies

- doc-cursor-agent-cli is first (doc exists; task = verify and link).
- update-dispatch-rule, update-agent-md, update-skill-doc, update-agents-readme all depend only on doc-cursor-agent-cli; can run in parallel.
- sync-template depends on all of those.
- link-docs-readme depends only on doc-cursor-agent-cli.

<original_prompt>
Add Cursor Agent CLI help to docs; update subagent commands across the app to use the agent CLI (e.g. agent --model <model> --print for non-interactive dispatch). Make a plan.
</original_prompt>
