import { doltSql } from "./connection";
import { doltCommit } from "./commit";
import * as fs from "fs";
import { execa } from "execa";
import { ResultAsync } from "neverthrow";
import { AppError, buildError, ErrorCode } from "../domain/errors";

const SCHEMA = [
  "CREATE TABLE `plan` (plan_id CHAR(36) PRIMARY KEY, title VARCHAR(255) NOT NULL, intent TEXT NOT NULL, status ENUM(\'draft\',\'active\',\'paused\',\'done\',\'abandoned\') DEFAULT \'draft\', priority INT DEFAULT 0, source_path VARCHAR(512) NULL, source_commit VARCHAR(64) NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL);",
  "CREATE TABLE `task` (task_id CHAR(36) PRIMARY KEY, plan_id CHAR(36) NOT NULL, feature_key VARCHAR(64) NULL, title VARCHAR(255) NOT NULL, intent TEXT NULL, scope_in TEXT NULL, scope_out TEXT NULL, acceptance JSON NULL, status ENUM(\'todo\',\'doing\',\'blocked\',\'done\',\'canceled\') DEFAULT \'todo\', owner ENUM('human','agent') DEFAULT 'agent', area VARCHAR(64) NULL, risk ENUM('low','medium','high') DEFAULT 'low', estimate_mins INT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, external_key VARCHAR(128) NULL UNIQUE, FOREIGN KEY (plan_id) REFERENCES `plan`(plan_id));",
  "CREATE TABLE `edge` (from_task_id CHAR(36) NOT NULL, to_task_id CHAR(36) NOT NULL, type ENUM(\'blocks\',\'relates\') DEFAULT \'blocks\', reason TEXT NULL, PRIMARY KEY (from_task_id, to_task_id, type), FOREIGN KEY (from_task_id) REFERENCES `task`(task_id), FOREIGN KEY (to_task_id) REFERENCES `task`(task_id));",
  "CREATE TABLE `event` (event_id CHAR(36) PRIMARY KEY, task_id CHAR(36) NOT NULL, kind ENUM(\'created\',\'started\',\'progress\',\'blocked\',\'unblocked\',\'done\',\'split\',\'decision_needed\',\'note\') NOT NULL, body JSON NOT NULL, actor ENUM(\'human\',\'agent\') DEFAULT \'agent\', created_at DATETIME NOT NULL, FOREIGN KEY (task_id) REFERENCES `task`(task_id));",
  "CREATE TABLE `decision` (decision_id CHAR(36) PRIMARY KEY, plan_id CHAR(36) NOT NULL, task_id CHAR(36) NULL, summary VARCHAR(255) NOT NULL, context TEXT NOT NULL, options JSON NULL, decision TEXT NOT NULL, consequences TEXT NULL, source_ref VARCHAR(512) NULL, created_at DATETIME NOT NULL, FOREIGN KEY (plan_id) REFERENCES `plan`(plan_id), FOREIGN KEY (task_id) REFERENCES `task`(task_id));",
];

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
