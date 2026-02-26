---
name: Batch CLI operations
overview: |
  Allow CLI commands that accept a single task or plan ID to accept multiple IDs in one invocation (variadic and/or comma-separated), so operators can run e.g. "tg done id1 id2 id3" instead of one call per ID. Same options (--force, --evidence, etc.) apply to all. Targets done, start, cancel, and note first; optional batch read for context/show; shared ID parsing and docs/tests.
fileTree: |
  src/cli/utils.ts              (modify)
  src/cli/done.ts               (modify)
  src/cli/start.ts              (modify)
  src/cli/cancel.ts             (modify)
  src/cli/note.ts               (modify)
  src/cli/context.ts            (modify, optional)
  src/cli/show.ts               (modify, optional)
  docs/cli-reference.md         (modify)
  __tests__/integration/        (modify – batch CLI tests)
risks:
  - description: Exit code and --json shape for partial batch failure may confuse scripts
    severity: medium
    mitigation: Document clearly; use exit 1 if any fail and --json array with per-id status/error so scripts can inspect
  - description: Backward compatibility if argument parsing changes
    severity: low
    mitigation: Use Commander variadic .argument("<ids...>"); single ID yields one-element array; no breaking change
tests:
  - "Integration: tg done id1 id2 (two IDs) and tg done id1,id2 (comma-separated) both succeed with same evidence"
  - "Integration: single ID still works (tg done <singleId>)"
  - "Integration: batch with one invalid ID reports per-id result and exit code 1"
  - "Unit or integration: parseIdList splits comma-separated and trims; empty after parse exits with error"
todos:
  - id: id-parse-helper
    content: Add parseIdList helper for variadic + comma-separated IDs
    intent: |
      Add a small helper that takes the raw string[] from Commander (variadic args) and returns a normalized string[] of IDs. For each element, split on comma, trim, drop empty strings; flatten. If the result is empty, callers should exit with a clear error. Place in src/cli/utils.ts to keep one place for CLI helpers. No DB or Commander changes yet.
    domain: cli
    skill: cli-command-implementation
    changeType: modify
  - id: batch-done
    content: Refactor done command to accept multiple task IDs
    intent: |
      Change done to .argument("<taskIds...>", "One or more task IDs (space- or comma-separated)"). Use parseIdList; if empty, exit with usage error. For each task ID, run the existing single-ID logic (same --evidence, --checks, --force for all). Collect per-id result (ok or err). Human output: one line per ID (e.g. "Task <id> done." or "Task <id>: <error>"). With --json, output array of { id, status?, error? }. Exit code: 1 if any failure. Preserve single-ID behavior when one arg is passed.
    suggestedChanges: |
      In done.ts: .argument("<taskIds...>", "..."); action receives (taskIds: string[], options, cmd); const ids = parseIdList(taskIds); then for (const taskId of ids) { ... existing logic ... } and collect results for output/exit.
    blockedBy: [id-parse-helper]
    domain: cli
    skill: cli-command-implementation
    changeType: modify
  - id: batch-start
    content: Refactor start command to accept multiple task IDs
    intent: |
      Same pattern as batch-done. .argument("<taskIds...>", "..."); parseIdList; loop over IDs with same --agent and --force for all; per-id results; exit 1 if any fail; --json array of { id, status?, error? }.
    blockedBy: [id-parse-helper]
    domain: cli
    skill: cli-command-implementation
    changeType: modify
  - id: batch-cancel
    content: Refactor cancel command to accept multiple plan/task IDs
    intent: |
      cancel currently takes one <id> (plan or task, resolved by type or auto-detect). Change to .argument("<ids...>", "One or more plan or task IDs (space- or comma-separated)"); parseIdList; for each ID resolve as plan or task (same as today) and run cancel logic; per-id results; exit 1 if any fail; --json array of { id, status?, error? }.
    blockedBy: [id-parse-helper]
    domain: cli
    skill: cli-command-implementation
    changeType: modify
  - id: batch-note
    content: Refactor note command to accept multiple task IDs
    intent: |
      Same pattern: .argument("<taskIds...>", "..."); parseIdList; same --msg and --agent for all; per-id results; exit 1 if any fail; --json array of { id, status?, error? }.
    blockedBy: [id-parse-helper]
    domain: cli
    skill: cli-command-implementation
    changeType: modify
  - id: batch-docs-tests
    content: Document batch behavior and add integration tests
    intent: |
      In docs/cli-reference.md, for done, start, cancel, and note: document that multiple IDs can be passed (space-separated or comma-separated in one token); that options apply to all; exit code 1 if any operation fails; and --json output shape (array of { id, status?, error? }). Add integration tests: (1) tg done id1 id2 and tg done "id1,id2" with same evidence; (2) single ID unchanged; (3) batch with one invalid ID to assert per-id error and exit 1.
    blockedBy: [batch-done, batch-start, batch-cancel, batch-note]
    domain: docs
    skill: cli-command-implementation
    changeType: modify
isProject: false
---

## Analysis

The CLI currently accepts a single entity ID per command for `done`, `start`, `cancel`, and `note`. Running the same operation for many IDs (e.g. marking 60 imported tasks done with the same evidence) requires N invocations. Batching improves UX and scripting: one invocation with multiple IDs, with the same options applied to all.

**Design decisions**

- **ID input:** Support both **variadic positionals** (`tg done id1 id2 id3`) and **comma-separated** in one token (`tg done "id1,id2,id3"`) by normalizing the raw argument list: for each element, split on `,`, trim, drop empty; flatten to `string[]`. Commander’s `.argument("<ids...>", "...")` yields an array; a single ID becomes `["id1"]`, so backward compatibility is preserved.
- **Execution:** Sequential per ID; same options (e.g. `--force`, `--evidence`) apply to every ID. No parallel execution in v1.
- **Output and exit code:** Human-readable: one line per ID (success or error). With `--json`, output an array of `{ id, status?, error? }`. Exit code **1 if any** operation fails, so scripts can detect partial failure.
- **Scope:** Implement batch for the four write commands (done, start, cancel, note). Optional follow-up: batch read for `context` and `show` (same ID parsing, combined or per-ID output).

**Dependencies**

- Shared `parseIdList(raw: string[]): string[]` in `src/cli/utils.ts` so all batch commands use the same convention. Empty result → caller shows usage/error and exits.
- Each command refactor is independent after the helper exists; docs and integration tests depend on the four command changes.

## Proposed changes

1. **utils.ts**
   - Add `parseIdList(raw: string[]): string[]`: flatten `raw.map(s => s.split(",").map(t => t.trim()).filter(Boolean))`. No export change if utils already re-exported; callers import from `./utils`.

2. **done / start / cancel / note**
   - Replace `.argument("<taskId>", ...)` (or `<id>`) with `.argument("<ids...>", "One or more IDs (space- or comma-separated)")`.
   - In action: `const ids = parseIdList(idsFromCommander); if (ids.length === 0) { console.error("..."); process.exit(1); }`.
   - Loop: `for (const id of ids) { ... existing single-ID logic, push result to array ... }`.
   - After loop: if any failure, `process.exit(1)`; output human lines or `--json` array.

3. **context / show (optional)**
   - Same variadic + parseIdList; output can be one block per ID (human) or JSON array. Defer to a follow-up if time-boxed.

4. **Docs**
   - cli-reference.md: for each batch command, state that multiple IDs are allowed (space or comma-separated), options apply to all, exit 1 if any fail, and describe `--json` array shape.

5. **Tests**
   - Integration: `tg done <id1> <id2>`, `tg done "id1,id2"`, single ID; one test with an invalid ID in the batch to assert exit 1 and per-id error in output/JSON.

## Mermaid: Batch flow (single command)

```mermaid
flowchart LR
  A[Raw args from Commander] --> B[parseIdList]
  B --> C[ids string array]
  C --> D{Loop each id}
  D --> E[Run existing single-ID logic]
  E --> F[Collect result]
  F --> D
  D --> G[Output + exit code]
```

## Open questions

- None; exit code and --json shape are decided (exit 1 if any fail; --json array with per-id status/error).

<original_prompt>
It occurs to me our cli should be made to be able to handle arrays of ids for these kinds of operations. Can you make a plan to update the cli to support batch operations? Example: "tg done id" could become "tg done id1 id2 id3" or "tg done id1,id2,id3". Make a plan reviewing cli operations that could benefit from such batching operations.
</original_prompt>
