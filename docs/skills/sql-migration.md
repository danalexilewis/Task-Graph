# Skill: SQL migration

## Purpose

Add or change columns/tables in the Dolt-backed taskgraph schema in a way that is safe for existing repos (idempotent where possible).

## Examples

- Add nullable columns via `ALTER TABLE ... ADD COLUMN` after checking `information_schema.COLUMNS`.
- Use `CREATE TABLE IF NOT EXISTS` for initial schema so re-running init does not fail.
- Run migrations from `tg init` (e.g. `applyTaskDimensionsMigration`) so existing users get new columns on next init.

## Gotchas

- Dolt uses MySQL-compatible SQL; no `ADD COLUMN IF NOT EXISTS`. Check for column existence before altering.
- Prefer one migration function per logical change; call it from init after `applyMigrations`.
- Commit migration changes with a clear message so Dolt history is readable.
