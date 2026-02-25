import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  runTgCli,
} from "./test-utils";
import { doltSql } from "../../src/db/connection";

describe("Cursor format import integration", () => {
  let context: Awaited<ReturnType<typeof setupIntegrationTest>> | undefined;
  let planFilePath: string;

  beforeAll(async () => {
    context = await setupIntegrationTest();
    const plansDir = path.join(context.tempDir, "plans");
    fs.mkdirSync(plansDir, { recursive: true });
    planFilePath = path.join(plansDir, "cursor-test.plan.md");

    const planContent = `---
name: Cursor Import Test
overview: "Integration test for Cursor format import."
todos:
  - id: cursor-task-a
    content: "Task A"
    status: pending
  - id: cursor-task-b
    content: "Task B"
    status: completed
  - id: cursor-task-c
    content: "Task C depends on A"
    blockedBy: [cursor-task-a]
isProject: false
---
`;
    fs.writeFileSync(planFilePath, planContent);
  }, 60000);

  afterAll(() => {
    if (context) {
      teardownIntegrationTest(context.tempDir);
    }
  });

  it("should import Cursor plan with --format cursor", async () => {
    if (!context) throw new Error("Context not initialized");

    const { exitCode, stdout } = await runTgCli(
      `import plans/cursor-test.plan.md --plan "Cursor Import Test" --format cursor --no-commit`,
      context.tempDir,
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Successfully imported");

    // Verify tasks in DB
    const tasksResult = await doltSql(
      `SELECT task_id, external_key, title, status FROM \`task\` ORDER BY external_key`,
      context.doltRepoPath,
    );
    expect(tasksResult.isOk()).toBe(true);
    const tasks = tasksResult._unsafeUnwrap();
    expect(tasks.length).toBe(3);

    type TaskRow = {
      task_id: string;
      external_key: string;
      title: string;
      status: string;
    };
    const byKey = Object.fromEntries(
      (tasks as TaskRow[]).map((t) => [t.external_key, t]),
    ) as Record<string, TaskRow>;
    expect(byKey["cursor-task-a"].title).toBe("Task A");
    expect(byKey["cursor-task-a"].status).toBe("todo");
    expect(byKey["cursor-task-b"].title).toBe("Task B");
    expect(byKey["cursor-task-b"].status).toBe("done");
    expect(byKey["cursor-task-c"].title).toBe("Task C depends on A");
  });

  it("should create blocking edge from blockedBy", async () => {
    if (!context) throw new Error("Context not initialized");

    const edgesResult = await doltSql(
      `SELECT from_task_id, to_task_id, type FROM \`edge\``,
      context.doltRepoPath,
    );
    expect(edgesResult.isOk()).toBe(true);
    const edges = edgesResult._unsafeUnwrap();
    expect(edges.length).toBeGreaterThanOrEqual(1);
    expect(
      edges.some((e: Record<string, unknown>) => e.type === "blocks"),
    ).toBe(true);
  });
});
