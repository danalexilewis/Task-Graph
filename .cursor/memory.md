# Persistent Memory

## Plan import
- Task **title** (from todo `content`) is stored in `task.title` (VARCHAR(255)). Keep plan todo titles under 255 characters or import will fail.

## tg context
- Context command reads domain/skill from **task_domain** and **task_skill** junction tables (when present). Repos that have run the full migration suite use these; older repos may have `task.domain` / `task.skill` columns instead.

## CLI scaffolding (`tg setup`)
- Commander `--no-<flag>` options default to `true`; don’t pass `false` as the default value or you’ll invert behavior (setup will do nothing).
- Package entrypoints should match build output: `tools/taskgraph/package.json` `bin`/`main` must point at `dist/src/cli/index.js` (not `dist/cli/index.js`).

## Dolt JSON columns
- `event.body` may be returned as object or string by doltSql depending on driver. Handle both: `typeof raw === 'string' ? JSON.parse(raw) : raw`.

## Migration idempotency
- `applyTaskDimensionsMigration` must skip when `task_domain` exists (junction migration has run and dropped domain/skill from task). Otherwise re-adding columns conflicts with existing `change_type`.
