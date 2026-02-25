"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertTasksAndEdges = upsertTasksAndEdges;
const uuid_1 = require("uuid");
const commit_1 = require("../db/commit");
const neverthrow_1 = require("neverthrow");
const query_1 = require("../db/query");
const escape_1 = require("../db/escape");
function upsertTasksAndEdges(planId, parsedTasks, repoPath, noCommit = false) {
    const currentTimestamp = (0, query_1.now)();
    const q = (0, query_1.query)(repoPath);
    return q
        .select("task", {
        columns: ["task_id", "external_key"],
        where: { plan_id: planId },
    })
        .andThen((existingTasksResult) => {
        return neverthrow_1.ResultAsync.fromPromise((async () => {
            const existingTasks = existingTasksResult;
            const externalKeyToTaskId = new Map();
            existingTasks.forEach((task) => {
                if (task.external_key) {
                    externalKeyToTaskId.set(task.external_key, task.task_id);
                }
            });
            let importedTasksCount = 0;
            for (const parsedTask of parsedTasks) {
                let taskId = externalKeyToTaskId.get(parsedTask.stableKey);
                if (taskId) {
                    // Update existing task
                    const updateResult = await q.update("task", {
                        title: parsedTask.title,
                        feature_key: parsedTask.feature ?? null,
                        area: parsedTask.area ?? null,
                        change_type: parsedTask.changeType ?? null,
                        intent: parsedTask.intent ?? null,
                        suggested_changes: parsedTask.suggestedChanges ?? null,
                        acceptance: parsedTask.acceptance.length > 0
                            ? (0, query_1.jsonObj)({ val: JSON.stringify(parsedTask.acceptance) })
                            : null,
                        ...(parsedTask.status !== undefined && {
                            status: parsedTask.status,
                        }),
                        updated_at: currentTimestamp,
                    }, { task_id: taskId });
                    if (updateResult.isErr()) {
                        console.error("Error updating task:", updateResult.error);
                        throw updateResult.error;
                    }
                }
                else {
                    // Insert new task
                    taskId = (0, uuid_1.v4)();
                    importedTasksCount++;
                    const taskStatus = parsedTask.status ?? "todo";
                    const insertResult = await q.insert("task", {
                        task_id: taskId,
                        plan_id: planId,
                        external_key: parsedTask.stableKey,
                        title: parsedTask.title,
                        feature_key: parsedTask.feature ?? null,
                        area: parsedTask.area ?? null,
                        change_type: parsedTask.changeType ?? null,
                        intent: parsedTask.intent ?? null,
                        suggested_changes: parsedTask.suggestedChanges ?? null,
                        acceptance: parsedTask.acceptance.length > 0
                            ? (0, query_1.jsonObj)({ val: JSON.stringify(parsedTask.acceptance) })
                            : null,
                        status: taskStatus,
                        created_at: currentTimestamp,
                        updated_at: currentTimestamp,
                    });
                    if (insertResult.isErr()) {
                        console.error("Error inserting new task:", insertResult.error);
                        throw insertResult.error;
                    }
                    const insertEventResult = await q.insert("event", {
                        event_id: (0, uuid_1.v4)(),
                        task_id: taskId,
                        kind: "created",
                        body: (0, query_1.jsonObj)({
                            title: parsedTask.title,
                            externalKey: parsedTask.stableKey,
                        }),
                        created_at: currentTimestamp,
                    });
                    if (insertEventResult.isErr()) {
                        console.error("Error inserting new task event:", insertEventResult.error);
                        throw insertEventResult.error;
                    }
                }
                // Register for edge resolution (blocker keys may reference tasks just inserted)
                externalKeyToTaskId.set(parsedTask.stableKey, taskId);
                // Sync task_domain and task_skill junction tables
                const delDomainResult = await q.raw(`DELETE FROM \`task_domain\` WHERE task_id = '${(0, escape_1.sqlEscape)(taskId)}'`);
                if (delDomainResult.isErr())
                    throw delDomainResult.error;
                const delSkillResult = await q.raw(`DELETE FROM \`task_skill\` WHERE task_id = '${(0, escape_1.sqlEscape)(taskId)}'`);
                if (delSkillResult.isErr())
                    throw delSkillResult.error;
                for (const domain of parsedTask.domains ?? []) {
                    const ins = await q.insert("task_domain", {
                        task_id: taskId,
                        domain,
                    });
                    if (ins.isErr())
                        throw ins.error;
                }
                for (const skill of parsedTask.skills ?? []) {
                    const ins = await q.insert("task_skill", {
                        task_id: taskId,
                        skill,
                    });
                    if (ins.isErr())
                        throw ins.error;
                }
                // Handle edges
                for (const blockerKey of parsedTask.blockedBy) {
                    const blockerTaskId = externalKeyToTaskId.get(blockerKey);
                    if (!blockerTaskId) {
                        console.warn(`Blocker task with stable key '${blockerKey}' not found. Skipping edge creation for task '${parsedTask.stableKey}'.`);
                        continue;
                    }
                    const edgeExistsResult = await q.count("edge", {
                        from_task_id: blockerTaskId,
                        to_task_id: taskId,
                        type: "blocks",
                    });
                    if (edgeExistsResult.isErr())
                        throw edgeExistsResult.error;
                    const edgeExists = edgeExistsResult.value;
                    if (edgeExists === 0) {
                        const insertEdgeResult = await q.insert("edge", {
                            from_task_id: blockerTaskId,
                            to_task_id: taskId,
                            type: "blocks",
                            reason: "Blocked by plan import",
                        });
                        if (insertEdgeResult.isErr()) {
                            console.error("Error inserting new edge:", insertEdgeResult.error);
                            throw insertEdgeResult.error;
                        }
                    }
                }
            }
            const commitResult = await (0, commit_1.doltCommit)("plan-import: upsert tasks and edges", repoPath, noCommit);
            if (commitResult.isErr())
                throw commitResult.error;
            return {
                importedTasksCount,
                createdPlansCount: 0, // This logic is in the cli/import.ts, not here.
            };
        })(), (e) => e);
    });
}
