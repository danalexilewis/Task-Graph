# plan-authoring

Use this guide when writing plans in Cursor format for import into TaskGraph.

## File location

- Store plans in `plans/` as `plans/<name>.md`

## Minimal Cursor-format frontmatter

```yaml
---
name: My Plan
overview: "What this plan accomplishes."
todos:
  - id: stable-key
    content: "A small task"
    status: pending
  - id: depends-on-first
    content: "Another small task"
    blockedBy: [stable-key]
---
```

## Optional task dimensions

- `domain`: string or array of strings → `docs/<domain>.md`
- `skill`: string or array of strings → `docs/skills/<skill>.md`
- `changeType`: one of `create`, `modify`, `refactor`, `fix`, `investigate`, `test`, `document`

Pick dimensions that help an agent load the right conventions and choose the right approach.

## Import command

```bash
tg import plans/<file> --plan "<Plan Name>" --format cursor
```

