# Sitrep breadcrumb

Coordination file so multiple `/work` instances avoid all generating a sitrep at once. One agent claims "making sitrep"; others skip generation and go straight to task pull or read the existing sitrep.

## Location

- **Path:** `.taskgraph/sitrep-breadcrumb.json` (repo root).
- **Git:** File is git-ignored; it is runtime state only.

## Format

```json
{
  "state": "making_sitrep" | "idle",
  "at": "<ISO8601>",
  "by": "work"
}
```

| Field   | Values           | Meaning |
| ------- | ---------------- | ------- |
| `state` | `making_sitrep`  | An agent is currently generating the sitrep. |
|         | `idle`           | No one is generating; last update was at `at`. |
| `at`    | ISO8601 string   | Time of last state change. |
| `by`    | `"work"`         | Set by the /work skill. |

## Rules

1. **First thing every `/work` agent does** (when no plan is specified) is read this file.
2. **If `state === "making_sitrep"` and `at` is within the last 10 minutes** → another agent is generating the sitrep; skip sitrep generation. Go straight to `tg next` and work (or read existing sitrep if present).
3. **If no sitrep exists or sitrep is older than 30 minutes**, and there is no recent `making_sitrep` breadcrumb → write breadcrumb with `state: "making_sitrep"`, `at: now` (ISO8601), `by: "work"`, then generate the sitrep.
4. **After generating the sitrep**, write breadcrumb with `state: "idle"` (and same `at`), or remove the file.
5. **When an agent returns from doing tasks** (loop iteration or re-entry), check the sitrep; if missing or stale (>30 min), it may write the breadcrumb and generate a new sitrep (cycle in/out).

## Staleness

- **Breadcrumb `making_sitrep`:** Consider "recent" only if `at` is within **10 minutes**. Older than 10 minutes → treat as no active generator; you may generate.
- **Sitrep file:** Consider **stale** if `generated_at` (in sitrep frontmatter) is older than **30 minutes**. If stale and no recent breadcrumb, generate a new sitrep.

## Related

- [docs/leads/README.md](README.md) (Sitrep and Formation)
- [docs/leads/execution.md](execution.md) (Phase 0 self-orientation)
- [.cursor/skills/work/SKILL.md](../../.cursor/skills/work/SKILL.md) (Phase 0: breadcrumb-first coordination)
