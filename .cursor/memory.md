# Persistent Memory

## Plan import
- Task **title** (from todo `content`) is stored in `task.title` (VARCHAR(255)). Keep plan todo titles under 255 characters or import will fail.

## tg context
- Context command reads domain/skill from **task_domain** and **task_skill** junction tables (when present). Repos that have run the full migration suite use these; older repos may have `task.domain` / `task.skill` columns instead.

## Using tg in another repo
- No script in package.json needed: `pnpm tg` runs the CLI from node_modules/.bin. Same for `npx tg` with npm.

## CLI scaffolding (`tg setup`)
- Commander `--no-<flag>` options default to `true`; don’t pass `false` as the default value or you’ll invert behavior (setup will do nothing).
- Package entrypoints should match build output: `package.json` `bin`/`main` point at `dist/cli/index.js`.
- `tg setup` resolves templates from `path.join(__dirname, '..', 'template')`: at runtime dist/cli → dist/template; in dev (tsx) src/cli → src/template. Templates live in `src/template/` and are copied to `dist/template/` by the build.

## Dolt JSON columns
- `event.body` may be returned as object or string by doltSql depending on driver. Handle both: `typeof raw === 'string' ? JSON.parse(raw) : raw`.

## Migration idempotency
- `applyTaskDimensionsMigration` must skip when `task_domain` exists (junction migration has run and dropped domain/skill from task). Otherwise re-adding columns conflicts with existing `change_type`.

## Plan authoring (user correction)
- **Always use rich planning.** Plans must include fileTree, risks, tests, per-task intent, suggestedChanges when helpful, and markdown body ending with `<original_prompt>`. See docs/plan-format.md and .cursor/rules/plan-authoring.mdc. When creating plans, follow the rule — do not default to minimal/spartan format.

## Plan filename convention
- Plan filenames: `yy-mm-dd_the_file_name.md` (e.g. `26-02-26_restructure_src_npm_layout.md`). Two-digit year, date, then underscore and slug. See plan-authoring.mdc.

## Memory rule (for agents)
- memory.mdc includes an explicit trigger list and a "Before you consider your response complete" checklist. If any trigger applied (bug fix, pattern/rule change, user correction, tooling quirk), the last edit in that response must be to .cursor/memory.md — do not skip.
