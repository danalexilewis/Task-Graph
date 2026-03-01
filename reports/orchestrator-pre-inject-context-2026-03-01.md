# Orchestrator pre-inject context (worktree + path)

**Date:** 2026-03-01  
**Scope:** Design change so the lead/orchestrator pre-starts tasks and injects worktree path (and optionally doc content) into implementer prompts, reducing sub-agent orientation actions.  
**Produced by:** Orchestrator analysis and implementation from user request.

---

## Findings

- **Problem:** Implementers were spending multiple actions on orientation: claiming the task (`tg start --worktree`), waiting/polling for completion, running `tg worktree list --json` to find the path, then loading context. This was especially visible when the start command ran long and the sub-agent had to poll terminal files.
- **Decision:** Make **orchestrator pre-start and inject by default.** The orchestrator runs `tg start <taskId> --agent <name> --worktree` for each task in the batch, then `tg worktree list --json` once to resolve all worktree paths (match by branch `tg/<taskId>` or `tg-<hash_id>`), and inject **`{{WORKTREE_PATH}}`** into every implementer prompt. The implementer’s Step 1 becomes: `cd {{WORKTREE_PATH}}`, emit start heartbeat, then implement — no `tg start`, no worktree list, no polling.
- **Optional extension:** Orchestrator can pre-load and inject doc content (e.g. `docs/agent-field-guide.md`, DOC_PATHS) so the implementer does not need to `read_file` on each listed doc; keep prompt size within context limits.

## Files updated

| Area                 | File                                                                                             | Change                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Dispatch rule        | `.cursor/rules/subagent-dispatch.mdc`                                                            | Pre-start + inject WORKTREE_PATH default; one worktree list after batch start; optional doc-content injection note |
| Implementer template | `.cursor/agents/implementer.md`                                                                  | Step 1: normal case = path injected (cd only); fallback = self-start when path omitted                             |
| Agent registry       | `.cursor/agents/README.md`                                                                       | Default = orchestrator pre-starts and injects path                                                                 |
| Work skill           | `.cursor/skills/work/SKILL.md`                                                                   | Loop step 6b: pre-start, then single worktree list to set paths                                                    |
| Field guide          | `docs/agent-field-guide.md`                                                                      | Worktree lifecycle: normal case = path injected; fallback = self-start                                             |
| Execution lead       | `docs/leads/execution.md`                                                                        | Dispatch default = pre-start and inject WORKTREE_PATH                                                              |
| Template             | `src/template/.cursor/rules/subagent-dispatch.mdc`, `src/template/.cursor/agents/implementer.md` | Same contract and Step 1 wording for new repos                                                                     |

## Implications

- Orchestrator does more work per batch (N `tg start` calls, one `tg worktree list --json`, path matching) before dispatch; implementer sessions start with path and context already set.
- Fallback remains: when WORKTREE_PATH is omitted (e.g. batch too large to pre-start), implementer self-starts as before.
- Future CLI improvement: a `tg worktree path <taskId>` that reads the started event and prints the path would let the orchestrator get each path in one call instead of parsing worktree list.

---

## Summary

The default is now orchestrator pre-start and inject **`{{WORKTREE_PATH}}`** so implementers skip claiming and path lookup. Changes are documented in the dispatch rule, implementer template, work skill, execution lead, and agent-field-guide; the template copy is updated for new repos. Optional next step is inlining key doc content to reduce implementer `read_file` actions further.
