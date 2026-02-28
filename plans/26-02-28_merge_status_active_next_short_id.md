---
name: Merge status Active Work and Next Runnable with short Id
overview: Merge the Active Work and Next Runnable tables in tg status into one table and display task Id as short hash (never full UUID) in that section.
fileTree: |
  src/cli/
  ├── status.ts              (modify)
  __tests__/
  ├── cli/
  │   ├── status.test.ts     (modify)
  │   └── dashboard.test.ts  (modify)
  └── integration/
      └── status-live.test.ts (modify)
  docs/
  ├── cli-reference.md       (modify)
  └── agent-contract.md      (modify if references Active Work / Next Runnable)
risks:
  - description: Dashboard and live view rely on formatStatusAsString; changing section layout must not break OpenTUI or fallback loop.
    severity: low
    mitigation: Single code path in status.ts; no separate dashboard rendering for this section.
  - description: Tests assert exact section titles "Active Work" and "Next Runnable"; updating them must not miss edge cases.
    severity: low
    mitigation: Update all three test files that reference those strings; assert new section title and column set.
tests:
  - "status.test.ts: assert merged section title and columns (Id, Task, Plan, Status, Agent); doing rows then next runnable; Id is short"
  - "dashboard.test.ts and status-live.test.ts: assert new section title and that output contains merged content"
todos:
  - id: merge-active-next-short-id
    content: "Merge Active Work and Next Runnable into one section; display Id as short hash"
    agent: implementer
    intent: |
      In src/cli/status.ts:
      1. Add a helper that builds one combined list: all activeWork rows (status 'doing') first, then nextTasks (next 3 runnable todo). Each row needs: displayId (hash_id ?? task_id; if hash_id is null use task_id.slice(0, 8) so we never show full UUID in this table), title, plan_title, status ('doing' | 'todo'), agent (for doing: from started event body.agent; for todo: '—').
      2. Replace the two boxed sections "Active Work" and "Next Runnable" with a single boxed section titled "Active & next" (or "Work & next runnable"). Table headers: Id, Task, Plan, Status, Agent. Use same renderTable + boxedSection pattern. Empty state: one placeholder row when both activeWork and nextTasks are empty.
      3. Remove getActiveWorkSectionContent and getNextRunnableSectionContent as separate section builders; replace with one function that takes StatusData and width and returns the merged table content (or inline in formatStatusAsString / printHumanStatus).
      4. Ensure formatStatusAsString and printHumanStatus use the single section. Dashboard and OpenTUI use formatStatusAsString so they get the change automatically.
      5. JSON output (printJsonStatus) can keep activeWork and nextTasks as separate arrays for backward compatibility; no API change required.
    suggestedChanges: |
      getMergedActiveNextContent(d: StatusData, w: number): string
      - rows = [...d.activeWork.map(doingRow), ...d.nextTasks.map(todoRow)]
      - displayId(t) = t.hash_id ?? (t.task_id.slice(0, 8) or keep task_id if product prefers)
      - headers: ["Id", "Task", "Plan", "Status", "Agent"]
    changeType: modify
  - id: status-merge-tests-docs
    content: "Update status tests and docs for merged Active & next section and short Id"
    agent: implementer
    blockedBy: [merge-active-next-short-id]
    intent: |
      1. __tests__/cli/status.test.ts: Replace expectations for "Active Work" and "Next Runnable" with one section. Assert section title "Active & next" (or chosen title), columns Id, Task, Plan, Status, Agent. Assert doing tasks appear first with status 'doing' and agent when present; then up to 3 runnable with status 'todo' and agent '—'. Assert Id column does not contain a full UUID (either hash_id or truncated).
      2. __tests__/cli/dashboard.test.ts: Update assertion from "Next Runnable" or "Active Work" to the new section title.
      3. __tests__/integration/status-live.test.ts: Same; assert new section title and merged content.
      4. docs/cli-reference.md: In tg status and tg dashboard sections, replace "Active Work" and "Next Runnable" with the single merged section (e.g. "Active & next: doing tasks then next runnable (up to 3), columns Id (short), Task, Plan, Status, Agent").
      5. docs/agent-contract.md (if it mentions Active Work / Next Runnable): Update wording to the merged section and short Id.
    changeType: modify
isProject: false
---

## Analysis

The default `tg status` output currently shows two separate boxed tables: **Active Work** (all tasks with status `doing`, with agent from latest started event) and **Next Runnable** (up to 3 unblocked `todo` tasks). Both already display task Id as `hash_id ?? task_id`. The user requested: (1) merge these into a single table, and (2) use short hash/id for the id (never full UUID). Merging reduces visual fragmentation and keeps "what's in progress" and "what to pick next" in one place. Short Id is already the pattern; we add an explicit fallback (e.g. first 8 chars of `task_id`) when `hash_id` is null so the merged table never shows a full UUID.

Data is already available: `StatusData.activeWork` and `StatusData.nextTasks`. No new SQL; combine in memory, add a Status column (`doing` | `todo`) and Agent (for doing from event body, for todo use "—"). Order: doing first, then next runnable. One boxed section replaces two. Dashboard and live view use `formatStatusAsString`, so they get the change without separate code paths. JSON can keep `activeWork` and `nextTasks` separate for backward compatibility.

## Dependency graph

```
Parallel start (1 unblocked):
  └── merge-active-next-short-id (merge section + short Id in status.ts)

After merge-active-next-short-id:
  └── status-merge-tests-docs (tests + cli-reference + agent-contract)
```

## Proposed changes

- **Merged table:** One section "Active & next". Rows = activeWork (each with status `doing`, agent from body) then nextTasks (each with status `todo`, agent `—`). Headers: Id, Task, Plan, Status, Agent.
- **displayId:** `hash_id ?? task_id.slice(0, 8)` (or keep `task_id` if we decide full UUID fallback is acceptable; plan chooses truncated so "short id" is guaranteed).
- **Empty state:** When both lists are empty, one placeholder row (e.g. "—", "No active or runnable tasks", "—", "—", "—").
- **Tests:** One section title; assert column set and that Id is not a full UUID in that section.

## Open questions

- Section title: "Active & next" vs "Work & next runnable" — decided as "Active & next" unless you prefer the longer label.

## Original prompt

<original_prompt>
/plan lets merge the active work and next runnable tables in `tg status` and lets use the short hash/id for the next runnable id rather then the uuid.
this should be added to memory
</original_prompt>
