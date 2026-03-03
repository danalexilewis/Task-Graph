import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { doltSql } from "../../src/db/connection";
import { applyTaskFootprintBackfillMigration } from "../../src/db/migrate";
import { jsonObj, query } from "../../src/db/query";
import {
  runTgCli,
  setupIntegrationTest,
  teardownIntegrationTest,
} from "./test-utils";

function toDatetime(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

describe.serial("Footprint write path and backfill integration", () => {
  let context: Awaited<ReturnType<typeof setupIntegrationTest>> | undefined;
  let planId: string;
  let taskId: string;

  beforeAll(async () => {
    context = await setupIntegrationTest();
    const plansDir = path.join(context.tempDir, "plans");
    fs.mkdirSync(plansDir, { recursive: true });
    const planContent = `---
name: Footprint Test Plan
overview: "Plan for footprint started_at/ended_at integration tests."
todos:
  - id: footprint-task
    content: "Footprint task"
    status: pending
---
`;
    fs.writeFileSync(path.join(plansDir, "footprint-plan.md"), planContent);

    const { stdout: importOut } = await runTgCli(
      `import plans/footprint-plan.md --plan "Footprint Test Plan" --format cursor`,
      context.tempDir,
      false,
      undefined,
      { allowCommit: true },
    );
    expect(importOut).toContain("Successfully imported");

    const { stdout: listOut } = await runTgCli(
      `plan list --json`,
      context.tempDir,
    );
    const plans = JSON.parse(listOut) as Array<{
      plan_id: string;
      title: string;
    }>;
    const plan = plans.find((p) => p.title === "Footprint Test Plan");
    expect(plan).toBeDefined();
    planId = plan?.plan_id ?? "";

    const { stdout: nextOut } = await runTgCli(
      `next --plan ${planId} --limit 5 --json`,
      context.tempDir,
    );
    const nextTasks = JSON.parse(nextOut) as Array<{
      task_id: string;
      title: string;
    }>;
    const t = nextTasks.find((row) => row.title === "Footprint task");
    expect(t).toBeDefined();
    taskId = t?.task_id ?? "";
  }, 60000);

  afterAll(async () => {
    if (context) await teardownIntegrationTest(context);
  });

  it("tg start sets task.started_at; tg done sets task.ended_at (assert via raw query)", async () => {
    if (!context) throw new Error("Context not initialized");

    await runTgCli(
      `start ${taskId} --agent implementer-footprint`,
      context.tempDir,
      false,
      undefined,
      { allowCommit: true },
    );

    const afterStart = await doltSql(
      `SELECT started_at, ended_at FROM \`task\` WHERE task_id = '${taskId}'`,
      context.doltRepoPath,
    );
    expect(afterStart.isOk()).toBe(true);
    const startRow = (
      afterStart._unsafeUnwrap() as Array<{
        started_at: string | Date | null;
        ended_at: string | Date | null;
      }>
    )[0];
    expect(startRow).toBeDefined();
    expect(startRow.started_at).not.toBeNull();
    expect(String(startRow.started_at).length).toBeGreaterThan(0);
    expect(startRow.ended_at).toBeNull();

    await runTgCli(
      `done ${taskId} --evidence "footprint test done"`,
      context.tempDir,
      false,
      undefined,
      { allowCommit: true },
    );

    const afterDone = await doltSql(
      `SELECT started_at, ended_at FROM \`task\` WHERE task_id = '${taskId}'`,
      context.doltRepoPath,
    );
    expect(afterDone.isOk()).toBe(true);
    const doneRow = (
      afterDone._unsafeUnwrap() as Array<{
        started_at: string | Date | null;
        ended_at: string | Date | null;
      }>
    )[0];
    expect(doneRow).toBeDefined();
    expect(doneRow.started_at).not.toBeNull();
    expect(doneRow.ended_at).not.toBeNull();
    expect(String(doneRow.ended_at).length).toBeGreaterThan(0);
  });

  it("backfill migration populates footprint for tasks with started+done events; Agent Hours consistent", async () => {
    if (!context) throw new Error("Context not initialized");

    const plansDir = path.join(context.tempDir, "plans");
    const backfillPlanContent = `---
name: Footprint Backfill Plan
overview: "Plan for backfill test."
todos:
  - id: backfill-task
    content: "Backfill task"
    status: pending
---
`;
    fs.writeFileSync(
      path.join(plansDir, "footprint-backfill-plan.md"),
      backfillPlanContent,
    );
    const { stdout: importOut } = await runTgCli(
      `import plans/footprint-backfill-plan.md --plan "Footprint Backfill Plan" --format cursor`,
      context.tempDir,
      false,
      undefined,
      { allowCommit: true },
    );
    expect(importOut).toContain("Successfully imported");

    const { stdout: listOut } = await runTgCli(
      `plan list --json`,
      context.tempDir,
    );
    const plans = JSON.parse(listOut) as Array<{
      plan_id: string;
      title: string;
    }>;
    const backfillPlan = plans.find(
      (p) => p.title === "Footprint Backfill Plan",
    );
    expect(backfillPlan).toBeDefined();
    const backfillPlanId = backfillPlan?.plan_id ?? "";

    const { stdout: nextOut } = await runTgCli(
      `next --plan ${backfillPlanId} --limit 5 --json`,
      context.tempDir,
    );
    const nextTasks = JSON.parse(nextOut) as Array<{
      task_id: string;
      title: string;
    }>;
    const backfillTask = nextTasks.find((row) => row.title === "Backfill task");
    expect(backfillTask).toBeDefined();
    const backfillTaskId = backfillTask?.task_id ?? "";

    const q = query(context.doltRepoPath);
    const base = new Date();
    const startedAt = toDatetime(base);
    const endedAt = toDatetime(new Date(base.getTime() + 3600 * 1000));

    await q
      .insert("event", {
        event_id: uuidv4(),
        task_id: backfillTaskId,
        kind: "started",
        body: jsonObj({ agent: "test", timestamp: startedAt }),
        created_at: startedAt,
      })
      .then((r) => r._unsafeUnwrap());
    await q
      .insert("event", {
        event_id: uuidv4(),
        task_id: backfillTaskId,
        kind: "done",
        body: jsonObj({ evidence: "backfill test", timestamp: endedAt }),
        created_at: endedAt,
      })
      .then((r) => r._unsafeUnwrap());

    const beforeBackfill = await doltSql(
      `SELECT started_at, ended_at FROM \`task\` WHERE task_id = '${backfillTaskId}'`,
      context.doltRepoPath,
    );
    expect(beforeBackfill.isOk()).toBe(true);
    const beforeRow = (
      beforeBackfill._unsafeUnwrap() as Array<{
        started_at: unknown;
        ended_at: unknown;
      }>
    )[0];
    expect(beforeRow.started_at).toBeNull();
    expect(beforeRow.ended_at).toBeNull();

    const backfillResult = await applyTaskFootprintBackfillMigration(
      context.doltRepoPath,
      true,
    );
    expect(backfillResult.isOk()).toBe(true);

    const afterBackfill = await doltSql(
      `SELECT started_at, ended_at FROM \`task\` WHERE task_id = '${backfillTaskId}'`,
      context.doltRepoPath,
    );
    expect(afterBackfill.isOk()).toBe(true);
    const afterRow = (
      afterBackfill._unsafeUnwrap() as Array<{
        started_at: string | Date | null;
        ended_at: string | Date | null;
      }>
    )[0];
    expect(afterRow.started_at).not.toBeNull();
    expect(afterRow.ended_at).not.toBeNull();

    const { stdout: statusOut } = await runTgCli(
      "status --json",
      context.tempDir,
    );
    const statusData = JSON.parse(statusOut) as { totalAgentHours: number };
    expect(typeof statusData.totalAgentHours).toBe("number");
    expect(statusData.totalAgentHours).toBeGreaterThanOrEqual(1);
  });

  it("Agent Hours value unchanged for fixture data after backfill (regression)", async () => {
    if (!context) throw new Error("Context not initialized");

    const { stdout: beforeOut } = await runTgCli(
      "status --json",
      context.tempDir,
    );
    const beforeData = JSON.parse(beforeOut) as { totalAgentHours: number };
    const agentHoursBefore = beforeData.totalAgentHours;

    await applyTaskFootprintBackfillMigration(context.doltRepoPath, true);

    const { stdout: afterOut } = await runTgCli(
      "status --json",
      context.tempDir,
    );
    const afterData = JSON.parse(afterOut) as { totalAgentHours: number };
    const agentHoursAfter = afterData.totalAgentHours;

    expect(agentHoursAfter).toBe(agentHoursBefore);
  });
});
