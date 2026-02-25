"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCommand = startCommand;
const uuid_1 = require("uuid");
const commit_1 = require("../db/commit");
const utils_1 = require("./utils"); // Import Config
const invariants_1 = require("../domain/invariants");
const neverthrow_1 = require("neverthrow");
const errors_1 = require("../domain/errors");
const query_1 = require("../db/query");
const connection_1 = require("../db/connection");
const escape_1 = require("../db/escape");
function startCommand(program) {
    program
        .command("start")
        .description("Start a task")
        .argument("<taskId>", "ID of the task to start")
        .option("--agent <name>", "Agent identifier for multi-agent visibility")
        .option("--force", "Override claim when task is already being worked")
        .action(async (taskId, options, cmd) => {
        const agentName = options.agent ?? "default";
        const force = options.force ?? false;
        const result = await (0, utils_1.readConfig)().asyncAndThen((config) => {
            const currentTimestamp = (0, query_1.now)();
            const q = (0, query_1.query)(config.doltRepoPath);
            return q
                .select("task", {
                columns: ["status"],
                where: { task_id: taskId },
            })
                .andThen((currentStatusResult) => {
                if (currentStatusResult.length === 0) {
                    return (0, neverthrow_1.err)((0, errors_1.buildError)(errors_1.ErrorCode.TASK_NOT_FOUND, `Task with ID ${taskId} not found.`));
                }
                const currentStatus = currentStatusResult[0].status;
                if (currentStatus === "doing" && !force) {
                    const sql = `SELECT body FROM \`event\` WHERE task_id = '${(0, escape_1.sqlEscape)(taskId)}' AND kind = 'started' ORDER BY created_at DESC LIMIT 1`;
                    return (0, connection_1.doltSql)(sql, config.doltRepoPath).andThen((rows) => {
                        const row = rows[0];
                        const raw = row?.body;
                        const parsed = raw != null
                            ? typeof raw === "string"
                                ? JSON.parse(raw)
                                : raw
                            : null;
                        const claimant = parsed?.agent ?? "unknown";
                        return (0, neverthrow_1.err)((0, errors_1.buildError)(errors_1.ErrorCode.TASK_ALREADY_CLAIMED, `Task is being worked by ${claimant}. Use --force to override.`));
                    });
                }
                if (currentStatus === "todo") {
                    return (0, invariants_1.checkRunnable)(taskId, config.doltRepoPath);
                }
                if (currentStatus === "doing" && force) {
                    return (0, neverthrow_1.okAsync)(undefined); // Bypass claim guard
                }
                const tr = (0, invariants_1.checkValidTransition)(currentStatus, "doing");
                return tr.isOk() ? (0, neverthrow_1.okAsync)(undefined) : (0, neverthrow_1.errAsync)(tr.error);
            })
                .andThen(() => q.update("task", { status: "doing", updated_at: currentTimestamp }, { task_id: taskId }))
                .andThen(() => q.insert("event", {
                event_id: (0, uuid_1.v4)(),
                task_id: taskId,
                kind: "started",
                body: (0, query_1.jsonObj)({
                    agent: agentName,
                    timestamp: currentTimestamp,
                }),
                created_at: currentTimestamp,
            }))
                .andThen(() => (0, commit_1.doltCommit)(`task: start ${taskId}`, config.doltRepoPath, cmd.parent?.opts().noCommit))
                .map(() => ({ task_id: taskId, status: "doing" }));
        });
        result.match((data) => {
            const resultData = data;
            if (!cmd.parent?.opts().json) {
                console.log(`Task ${resultData.task_id} started.`);
            }
            else {
                console.log(JSON.stringify(resultData, null, 2));
            }
        }, (error) => {
            console.error(`Error starting task: ${error.message}`);
            if (cmd.parent?.opts().json) {
                console.log(JSON.stringify({
                    status: "error",
                    code: error.code,
                    message: error.message,
                    cause: error.cause,
                }));
            }
            process.exit(1);
        });
    });
}
