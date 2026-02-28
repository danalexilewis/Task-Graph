---
name: Status Table Narrow Terminal Fix
overview: Fix tg status table display on narrow terminals so tables never exceed available width and no "hanging" wrapped lines appear.
fileTree: |
  src/cli/
  ├── table.ts              (modify — cap total width when minWidths exceed budget)
  ├── status.ts             (modify — pass box inner width to renderTable for boxed sections)
  └── tui/
      └── boxen.ts          (modify — export effective inner width helper)
  __tests__/
  └── cli/
      └── status.test.ts    (modify — add narrow-width cap and optional status width assertion)
risks:
  - description: Changing "hard floor" minWidths behavior may surprise callers that relied on tables exceeding maxWidth
    severity: low
    mitigation: Document that maxWidth is strict; minimums are best-effort when they fit. All current status call sites want "fit on screen."
  - description: Boxen padding/border calculation wrong for different boxen versions or options
    severity: low
    mitigation: Centralize in one helper (e.g. getBoxInnerWidth); single place to adjust if boxen behavior differs.
tests:
  - "renderTable: every line length <= maxWidth when minWidths would otherwise exceed budget (e.g. 6 cols, maxWidth 45)"
  - "Optional: status output no line exceeds COLUMNS when run with narrow env"
todos:
  - id: box-inner-width
    content: "Add getBoxInnerWidth helper and use for boxed table maxWidth"
    agent: implementer
    intent: |
      Boxed sections use padding and border; the inner content width is less than the passed width. Add a small helper (e.g. in boxen.ts) that returns effective inner width (width - 2 for borders - 2 for padding = width - 4), or document the constant. Where status (and dashboard/format* functions) build a table that is then passed to boxedSection, pass this inner width as maxWidth to renderTable so the table is built to fit inside the box. Call sites: getActivePlansSectionContent, getActiveWorkSectionContent, getNextRunnableSectionContent, formatProjectsAsString, formatTasksAsString, formatDashboardTasksView, formatInitiativesAsString, and printHumanStatus/formatStatusAsString paths that use boxedSection.
    suggestedChanges: |
      boxen.ts: export function getBoxInnerWidth(outerWidth: number): number { return Math.max(20, outerWidth - 4); }
      status.ts: const innerW = getBoxInnerWidth(w); then pass innerW to renderTable in section builders when content is boxed.
    changeType: modify
  - id: cap-table-width
    content: "Cap renderTable total width so it never exceeds maxWidth"
    agent: implementer
    intent: |
      In table.ts after enforcing minWidths, compute total rendered width (sum(contentWidths) + colCount*2 + (colCount+1)). If total > maxWidth, shrink the flex column (first column) to make total <= maxWidth; if the flex column would go below its minimum, allow it (or shrink fixed columns proportionally) so that we never emit lines longer than maxWidth. This ensures the terminal never wraps table lines. Rely on existing wordWrap: true for cell content within the reduced column widths.
    suggestedChanges: |
      table.ts: after the "Enforce minimums" loop, totalContent = contentWidths.reduce((s,x)=>s+x,0); totalRendered = totalContent + colCount*2 + borders; if (totalRendered > maxWidth) { const overflow = totalRendered - maxWidth; reduce flex column (contentWidths[0]) by overflow, floor at 1; re-sum and if still over, consider shrinking fixed columns within their mins. }
    changeType: modify
  - id: tests-narrow-cap
    content: "Add tests for renderTable strict maxWidth when minWidths exceed budget"
    agent: implementer
    intent: |
      In __tests__/cli/status.test.ts, add a test that renderTable with 6 columns, minWidths [12,4,5,7,4,5], and maxWidth 45 produces output where every line (strip ANSI) has length <= 45. This validates the cap. Optionally add a test that status (or formatStatusAsString) with a narrow getTerminalWidth (e.g. mock or env COLUMNS=60) produces no line longer than that width.
    blockedBy: [cap-table-width]
    changeType: modify
isProject: false
---

## Analysis

The "hanging lines" on small screens are caused by (1) tables being built with `maxWidth: w` (terminal width) but then displayed inside `boxedSection(..., w)`, whose inner width is **w − 4** (borders + padding), so the table can overflow the box by 4 columns; and (2) `renderTable` enforces minimum column widths without capping total width, so when minimums sum to more than the budget, the table can exceed `maxWidth`. When the emitted line is wider than the terminal, the terminal wraps the line and the right-hand part appears on the next line under the first column.

Fix: (a) Use the box inner width for any table that is rendered inside a box. (b) In `renderTable`, after applying minimums, if total width would exceed `maxWidth`, shrink the flex column (and if needed allow below minimum) so that no line exceeds `maxWidth`.

## Dependency graph

```
Parallel start (2 unblocked):
  ├── box-inner-width (getBoxInnerWidth + wire through status)
  └── cap-table-width (renderTable strict cap)

After cap-table-width:
  └── tests-narrow-cap (assert line length <= maxWidth at narrow width)
```

## Proposed changes

- **boxen.ts**: Export `getBoxInnerWidth(outerWidth: number): number` returning `Math.max(20, outerWidth - 4)` so callers can request table width that fits inside the box.
- **table.ts**: After the minimums loop, if `sum(contentWidths) + colCount*2 + borders > maxWidth`, reduce `contentWidths[0]` (flex column) by the overflow; do not allow it to go below 1. If still over (e.g. fixed columns alone exceed budget), optionally shrink fixed columns proportionally within their mins until total fits.
- **status.ts**: In section builders that feed `boxedSection` (getActivePlansSectionContent, getActiveWorkSectionContent, getNextRunnableSectionContent, formatProjectsAsString, formatTasksAsString, formatDashboardTasksView, formatInitiativesAsString), accept width and call `getBoxInnerWidth(width)` before passing to `renderTable` as `maxWidth`. In printHumanStatus and dashboard paths, pass the same `w`; the section builders receive `w` and use inner width for the table.

## Open questions

None; analyst and orchestrator agreed on strict maxWidth and box inner width.

<original_prompt>
On smaller screens we are getting some weird hanging lines with tg status. It seems to only be in the first column but I think its somehow overflowing content from the previous line. Can you double check this. We want it to look good regardless of the terminal width. /plan
</original_prompt>
