"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyTaskDimensionsMigration = applyTaskDimensionsMigration;
exports.applyMigrations = applyMigrations;
const connection_1 = require("./connection");
const commit_1 = require("./commit");
const fs = __importStar(require("fs"));
const execa_1 = require("execa");
const neverthrow_1 = require("neverthrow");
const errors_1 = require("../domain/errors");
const SCHEMA = [
    "CREATE TABLE IF NOT EXISTS `plan` (plan_id CHAR(36) PRIMARY KEY, title VARCHAR(255) NOT NULL, intent TEXT NOT NULL, status ENUM(\'draft\',\'active\',\'paused\',\'done\',\'abandoned\') DEFAULT \'draft\', priority INT DEFAULT 0, source_path VARCHAR(512) NULL, source_commit VARCHAR(64) NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL);",
    "CREATE TABLE IF NOT EXISTS `task` (task_id CHAR(36) PRIMARY KEY, plan_id CHAR(36) NOT NULL, feature_key VARCHAR(64) NULL, title VARCHAR(255) NOT NULL, intent TEXT NULL, scope_in TEXT NULL, scope_out TEXT NULL, acceptance JSON NULL, status ENUM(\'todo\',\'doing\',\'blocked\',\'done\',\'canceled\') DEFAULT \'todo\', owner ENUM('human','agent') DEFAULT 'agent', area VARCHAR(64) NULL, risk ENUM('low','medium','high') DEFAULT 'low', estimate_mins INT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, external_key VARCHAR(128) NULL UNIQUE, FOREIGN KEY (plan_id) REFERENCES `plan`(plan_id));",
    "CREATE TABLE IF NOT EXISTS `edge` (from_task_id CHAR(36) NOT NULL, to_task_id CHAR(36) NOT NULL, type ENUM(\'blocks\',\'relates\') DEFAULT \'blocks\', reason TEXT NULL, PRIMARY KEY (from_task_id, to_task_id, type), FOREIGN KEY (from_task_id) REFERENCES `task`(task_id), FOREIGN KEY (to_task_id) REFERENCES `task`(task_id));",
    "CREATE TABLE IF NOT EXISTS `event` (event_id CHAR(36) PRIMARY KEY, task_id CHAR(36) NOT NULL, kind ENUM(\'created\',\'started\',\'progress\',\'blocked\',\'unblocked\',\'done\',\'split\',\'decision_needed\',\'note\') NOT NULL, body JSON NOT NULL, actor ENUM(\'human\',\'agent\') DEFAULT \'agent\', created_at DATETIME NOT NULL, FOREIGN KEY (task_id) REFERENCES `task`(task_id));",
    "CREATE TABLE IF NOT EXISTS `decision` (decision_id CHAR(36) PRIMARY KEY, plan_id CHAR(36) NOT NULL, task_id CHAR(36) NULL, summary VARCHAR(255) NOT NULL, context TEXT NOT NULL, options JSON NULL, decision TEXT NOT NULL, consequences TEXT NULL, source_ref VARCHAR(512) NULL, created_at DATETIME NOT NULL, FOREIGN KEY (plan_id) REFERENCES `plan`(plan_id), FOREIGN KEY (task_id) REFERENCES `task`(task_id));",
];
/** Returns true if the task table has the given column. */
function taskColumnExists(repoPath, columnName) {
    const q = `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task' AND COLUMN_NAME = '${columnName}' LIMIT 1`;
    return (0, connection_1.doltSql)(q, repoPath).map((rows) => rows.length > 0);
}
/** Add domain, skill, change_type columns to task table if missing (idempotent). */
function applyTaskDimensionsMigration(repoPath, noCommit = false) {
    return taskColumnExists(repoPath, "domain").andThen((hasDomain) => {
        if (hasDomain)
            return neverthrow_1.ResultAsync.fromSafePromise(Promise.resolve());
        const alter = "ALTER TABLE `task` ADD COLUMN `domain` VARCHAR(64) NULL, ADD COLUMN `skill` VARCHAR(64) NULL, ADD COLUMN `change_type` ENUM('create','modify','refactor','fix','investigate','test','document') NULL";
        return (0, connection_1.doltSql)(alter, repoPath)
            .map(() => undefined)
            .andThen(() => (0, commit_1.doltCommit)("db: add task dimensions (domain, skill, change_type)", repoPath, noCommit))
            .map(() => undefined);
    });
}
function applyMigrations(repoPath, noCommit = false) {
    return neverthrow_1.ResultAsync.fromPromise((async () => {
        for (const statement of SCHEMA) {
            const tempSqlFile = `${repoPath}/temp_migration.sql`;
            fs.writeFileSync(tempSqlFile, statement);
            const res = await neverthrow_1.ResultAsync.fromPromise((0, execa_1.execa)(process.env.DOLT_PATH || "dolt", ["sql"], {
                cwd: repoPath,
                shell: true,
                input: fs.readFileSync(tempSqlFile, "utf8"),
            }), (e) => (0, errors_1.buildError)(errors_1.ErrorCode.DB_QUERY_FAILED, `Dolt SQL query failed for statement: ${statement}`, e));
            fs.unlinkSync(tempSqlFile);
            if (res.isErr()) {
                console.error("Migration failed:", statement, res.error);
                throw res.error;
            }
        }
        return undefined;
    })(), (e) => (0, errors_1.buildError)(errors_1.ErrorCode.DB_QUERY_FAILED, "Failed to apply schema migrations", e))
        .andThen(() => (0, commit_1.doltCommit)("db: apply schema migrations", repoPath, noCommit))
        .map(() => undefined);
}
