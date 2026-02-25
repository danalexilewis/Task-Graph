# Skill: Dolt schema migration

## Purpose

Add or change columns/tables in the Dolt-backed taskgraph schema in a way that is safe for existing repos. Migrations must be idempotent where possible and applied via `tg init` so existing users get new schema on next init.

## Inputs

- Target change (e.g. new `domain` column on `task`)
- Access to `tools/taskgraph/src/db/migrate.ts`
- Knowledge of current schema (see `docs/schema.md`)

## Steps

1. Add the new migration function in `migrate.ts` (e.g. `applyTaskDimensionsMigration`).
2. Check for existence before altering: query `information_schema.COLUMNS` for the column/table; only run `ALTER TABLE` if missing.
3. Use `doltSql(alterStatement, repoPath)` for the ALTER; wrap in `ResultAsync`.
4. Call `doltCommit("db: descriptive message", repoPath, noCommit)` after a successful migration.
5. Call the migration from `cli/init.ts` after `applyMigrations` (e.g. `applyTaskDimensionsMigration(doltRepoPath, options.noCommit)`).
6. Update `domain/types.ts` with new fields and Zod schemas.
7. Update any code that inserts/updates the affected table (importer, split, task new, etc.).
8. Update `docs/schema.md`.

## Gotchas

- Dolt/MySQL has no `ADD COLUMN IF NOT EXISTS`. Check `information_schema` first.
- Keep initial `CREATE TABLE` in `applyMigrations` unchanged for backward compatibility; add columns only via separate migration functions.
- For `CREATE TABLE IF NOT EXISTS`, the table definition applies only when the table is created; existing tables are not altered.
- Call `applyTaskDimensionsMigration` (or equivalent) from `setupIntegrationTest` in `test-utils.ts` so integration tests have the new columns.

## Definition of done

- New columns/tables exist in a fresh `tg init` and in an existing repo after re-running `tg init`.
- `domain/types.ts` and `docs/schema.md` are updated.
- All insert/update paths for the affected table include the new fields.
- Integration tests pass (and test-utils applies the migration).
