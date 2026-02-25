import { doltSql } from "./connection";
import { doltCommit } from "./commit";
import * as fs from "fs";
import { execa } from "execa";
import { ResultAsync } from "neverthrow";
import { AppError, buildError, ErrorCode } from "../domain/errors";

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS `plan` (plan_id CHAR(36) PRIMARY KEY, title VARCHAR(255) NOT NULL, intent TEXT NOT NULL, status ENUM(\'draft\',\'active\',\'paused\',\'done\',\'abandoned\') DEFAULT \'draft\', priority INT DEFAULT 0, source_path VARCHAR(512) NULL, source_commit VARCHAR(64) NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL);",
  "CREATE TABLE IF NOT EXISTS `task` (task_id CHAR(36) PRIMARY KEY, plan_id CHAR(36) NOT NULL, feature_key VARCHAR(64) NULL, title VARCHAR(255) NOT NULL, intent TEXT NULL, scope_in TEXT NULL, scope_out TEXT NULL, acceptance JSON NULL, status ENUM(\'todo\',\'doing\',\'blocked\',\'done\',\'canceled\') DEFAULT \'todo\', owner ENUM('human','agent') DEFAULT 'agent', area VARCHAR(64) NULL, risk ENUM('low','medium','high') DEFAULT 'low', estimate_mins INT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, external_key VARCHAR(128) NULL UNIQUE, FOREIGN KEY (plan_id) REFERENCES `plan`(plan_id));",
  "CREATE TABLE IF NOT EXISTS `edge` (from_task_id CHAR(36) NOT NULL, to_task_id CHAR(36) NOT NULL, type ENUM(\'blocks\',\'relates\') DEFAULT \'blocks\', reason TEXT NULL, PRIMARY KEY (from_task_id, to_task_id, type), FOREIGN KEY (from_task_id) REFERENCES `task`(task_id), FOREIGN KEY (to_task_id) REFERENCES `task`(task_id));",
  "CREATE TABLE IF NOT EXISTS `event` (event_id CHAR(36) PRIMARY KEY, task_id CHAR(36) NOT NULL, kind ENUM(\'created\',\'started\',\'progress\',\'blocked\',\'unblocked\',\'done\',\'split\',\'decision_needed\',\'note\') NOT NULL, body JSON NOT NULL, actor ENUM(\'human\',\'agent\') DEFAULT \'agent\', created_at DATETIME NOT NULL, FOREIGN KEY (task_id) REFERENCES `task`(task_id));",
  "CREATE TABLE IF NOT EXISTS `decision` (decision_id CHAR(36) PRIMARY KEY, plan_id CHAR(36) NOT NULL, task_id CHAR(36) NULL, summary VARCHAR(255) NOT NULL, context TEXT NOT NULL, options JSON NULL, decision TEXT NOT NULL, consequences TEXT NULL, source_ref VARCHAR(512) NULL, created_at DATETIME NOT NULL, FOREIGN KEY (plan_id) REFERENCES `plan`(plan_id), FOREIGN KEY (task_id) REFERENCES `task`(task_id));",
];

/** Returns true if the task table has the given column. */
function taskColumnExists(
  repoPath: string,
  columnName: string,
): ResultAsync<boolean, AppError> {
  const q = `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task' AND COLUMN_NAME = '${columnName}' LIMIT 1`;
  return doltSql(q, repoPath).map((rows) => rows.length > 0);
}

/** Returns true if the plan table has the given column. */
function planColumnExists(
  repoPath: string,
  columnName: string,
): ResultAsync<boolean, AppError> {
  const q = `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'plan' AND COLUMN_NAME = '${columnName}' LIMIT 1`;
  return doltSql(q, repoPath).map((rows) => rows.length > 0);
}

/** Add file_tree, risks, tests columns to plan table if missing (idempotent). */
export function applyPlanRichFieldsMigration(
  repoPath: string,
  noCommit: boolean = false,
): ResultAsync<void, AppError> {
  return planColumnExists(repoPath, "file_tree").andThen((hasFileTree) => {
    if (hasFileTree) return ResultAsync.fromSafePromise(Promise.resolve());
    const alter =
      "ALTER TABLE `plan` ADD COLUMN `file_tree` TEXT NULL, ADD COLUMN `risks` JSON NULL, ADD COLUMN `tests` JSON NULL";
    return doltSql(alter, repoPath)
      .map(() => undefined)
      .andThen(() =>
        doltCommit(
          "db: add plan rich fields (file_tree, risks, tests)",
          repoPath,
          noCommit,
        ),
      )
      .map(() => undefined);
  });
}

/** Add domain, skill, change_type columns to task table if missing (idempotent). */
export function applyTaskDimensionsMigration(
  repoPath: string,
  noCommit: boolean = false,
): ResultAsync<void, AppError> {
  return tableExists(repoPath, "task_domain").andThen((hasJunction) => {
    if (hasJunction) return ResultAsync.fromSafePromise(Promise.resolve()); // Already migrated to junction tables
    return taskColumnExists(repoPath, "domain").andThen((hasDomain) => {
      if (hasDomain) return ResultAsync.fromSafePromise(Promise.resolve());
      const alter =
        "ALTER TABLE `task` ADD COLUMN `domain` VARCHAR(64) NULL, ADD COLUMN `skill` VARCHAR(64) NULL, ADD COLUMN `change_type` ENUM('create','modify','refactor','fix','investigate','test','document') NULL";
      return doltSql(alter, repoPath)
        .map(() => undefined)
        .andThen(() =>
          doltCommit(
            "db: add task dimensions (domain, skill, change_type)",
            repoPath,
            noCommit,
          ),
        )
        .map(() => undefined);
    });
  });
}

/** Add suggested_changes column to task table if missing (idempotent). */
export function applyTaskSuggestedChangesMigration(
  repoPath: string,
  noCommit: boolean = false,
): ResultAsync<void, AppError> {
  return taskColumnExists(repoPath, "suggested_changes").andThen((hasCol) => {
    if (hasCol) return ResultAsync.fromSafePromise(Promise.resolve());
    const alter = "ALTER TABLE `task` ADD COLUMN `suggested_changes` TEXT NULL";
    return doltSql(alter, repoPath)
      .map(() => undefined)
      .andThen(() =>
        doltCommit("db: add task suggested_changes column", repoPath, noCommit),
      )
      .map(() => undefined);
  });
}

/** Returns true if the table exists. */
function tableExists(
  repoPath: string,
  tableName: string,
): ResultAsync<boolean, AppError> {
  const q = `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${tableName}' LIMIT 1`;
  return doltSql(q, repoPath).map((rows) => rows.length > 0);
}

/** Replace task.domain/task.skill with task_domain and task_skill junction tables; migrate data and drop columns. */
export function applyTaskDomainSkillJunctionMigration(
  repoPath: string,
  noCommit: boolean = false,
): ResultAsync<void, AppError> {
  return tableExists(repoPath, "task_domain").andThen((exists) => {
    if (exists) return ResultAsync.fromSafePromise(Promise.resolve());
    return doltSql(
      `CREATE TABLE \`task_domain\` (task_id CHAR(36) NOT NULL, domain VARCHAR(64) NOT NULL, PRIMARY KEY (task_id, domain), FOREIGN KEY (task_id) REFERENCES \`task\`(task_id))`,
      repoPath,
    )
      .andThen(() =>
        doltSql(
          `CREATE TABLE \`task_skill\` (task_id CHAR(36) NOT NULL, skill VARCHAR(64) NOT NULL, PRIMARY KEY (task_id, skill), FOREIGN KEY (task_id) REFERENCES \`task\`(task_id))`,
          repoPath,
        ),
      )
      .andThen(() =>
        taskColumnExists(repoPath, "domain").andThen((hasDomain) => {
          if (!hasDomain) return ResultAsync.fromSafePromise(Promise.resolve());
          return doltSql(
            "INSERT INTO `task_domain` (task_id, domain) SELECT task_id, domain FROM `task` WHERE domain IS NOT NULL",
            repoPath,
          ).andThen(() =>
            doltSql(
              "INSERT INTO `task_skill` (task_id, skill) SELECT task_id, skill FROM `task` WHERE skill IS NOT NULL",
              repoPath,
            ),
          );
        }),
      )
      .andThen(() =>
        taskColumnExists(repoPath, "domain").andThen((hasDomain) => {
          if (!hasDomain) return ResultAsync.fromSafePromise(Promise.resolve());
          return doltSql(
            "ALTER TABLE `task` DROP COLUMN `domain`, DROP COLUMN `skill`",
            repoPath,
          );
        }),
      )
      .andThen(() =>
        doltCommit(
          "db: task_domain/task_skill junction tables; drop task.domain/task.skill",
          repoPath,
          noCommit,
        ),
      )
      .map(() => undefined);
  });
}

/** Chains all idempotent migrations. Safe to run on every command. */
export function ensureMigrations(
  repoPath: string,
  noCommit: boolean = false,
): ResultAsync<void, AppError> {
  return applyPlanRichFieldsMigration(repoPath, noCommit)
    .andThen(() => applyTaskDimensionsMigration(repoPath, noCommit))
    .andThen(() => applyTaskSuggestedChangesMigration(repoPath, noCommit))
    .andThen(() => applyTaskDomainSkillJunctionMigration(repoPath, noCommit))
    .map(() => undefined);
}

export function applyMigrations(
  repoPath: string,
  noCommit: boolean = false,
): ResultAsync<void, AppError> {
  return ResultAsync.fromPromise(
    (async () => {
      for (const statement of SCHEMA) {
        const tempSqlFile = `${repoPath}/temp_migration.sql`;
        fs.writeFileSync(tempSqlFile, statement);
        const res = await ResultAsync.fromPromise(
          execa(process.env.DOLT_PATH || "dolt", ["sql"], {
            cwd: repoPath,
            shell: true,
            input: fs.readFileSync(tempSqlFile, "utf8"),
          }),
          (e) =>
            buildError(
              ErrorCode.DB_QUERY_FAILED,
              `Dolt SQL query failed for statement: ${statement}`,
              e,
            ),
        );
        fs.unlinkSync(tempSqlFile);
        if (res.isErr()) {
          console.error("Migration failed:", statement, res.error);
          throw res.error;
        }
      }
      return undefined;
    })(),
    (e) =>
      buildError(
        ErrorCode.DB_QUERY_FAILED,
        "Failed to apply schema migrations",
        e,
      ),
  )
    .andThen(() =>
      doltCommit("db: apply schema migrations", repoPath, noCommit),
    )
    .map(() => undefined);
}
