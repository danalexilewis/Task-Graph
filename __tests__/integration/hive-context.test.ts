import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { runWithServerConnection } from "../../src/db/connection";
import {
  runTgCli,
  setupIntegrationTest,
  teardownIntegrationTest,
} from "./test-utils";

function toDatetime(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

describe("Context --hive (HiveSnapshot) integration", () => {
  let context: Awaited<ReturnType<typeof setupIntegrationTest>> | undefined;
  let taskId: string;

  beforeAll(async () => {
    context = await setupIntegrationTest();
    const plansDir = path.join(context.tempDir, "plans");
    fs.mkdirSync(plansDir, { recursive: true });

    const planContent = `---
name: Hive Context Test Plan
overview: Plan for tg context --hive integration tests.
todos:
  - id: hive-task-1
    content: Hive task 1
    status: pending
---
`;
    fs.writeFileSync(
      path.join(plansDir, "hive-context-test-plan.md"),
      planContent,
    );

    const { stdout: importOut } = await runTgCli(
      `import plans/hive-context-test-plan.md --plan "Hive Context Test Plan" --format cursor --no-commit`,
      context.tempDir,
    );
    expect(importOut).toContain("Successfully imported");

    const { stdout: nextOut } = await runTgCli(
      `next --plan "Hive Context Test Plan" --limit 5 --json`,
      context.tempDir,
    );
    const nextTasks = JSON.parse(nextOut) as Array<{
      task_id: string;
      title: string;
    }>;
    const t = nextTasks.find((x) => x.title === "Hive task 1");
    expect(t).toBeDefined();
    taskId = t?.task_id ?? "";
  }, 60000);

  afterAll(async () => {
    if (context) await teardownIntegrationTest(context);
  });

  it("tg context --hive --json with no doing tasks returns entries [] and generatedAt", async () => {
    if (!context) throw new Error("Context not initialized");

    const { exitCode, stdout } = await runTgCli(
      `context --hive --json`,
      context.tempDir,
    );
    expect(exitCode).toBe(0);
    const snapshot = JSON.parse(stdout) as {
      entries: unknown[];
      generatedAt?: string;
    };
    expect(Array.isArray(snapshot.entries)).toBe(true);
    expect(snapshot.entries).toHaveLength(0);
    expect(typeof snapshot.generatedAt).toBe("string");
  });

  it("tg context --hive --json with one doing task returns one entry with taskId, agent, recentNotes", async () => {
    if (!context) throw new Error("Context not initialized");

    const startedAt = toDatetime(new Date());
    const eventId = uuidv4();
    const startedBodyJson = JSON.stringify({
      agent: "implementer-1",
      timestamp: startedAt,
    });

    await runWithServerConnection(async (conn) => {
      await conn.query(
        "UPDATE task SET status = ?, updated_at = ? WHERE task_id = ?",
        ["doing", startedAt, taskId],
      );
      await conn.query(
        "INSERT INTO event (event_id, task_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?)",
        [eventId, taskId, "started", startedBodyJson, startedAt],
      );
      await conn.query("CALL DOLT_ADD('-A')");
      await conn.query("CALL DOLT_COMMIT('-m', ?, '--allow-empty')", [
        "hive-context doing",
      ]);
    });

    const { exitCode, stdout } = await runTgCli(
      `context --hive --json`,
      context.tempDir,
    );
    expect(exitCode).toBe(0);
    const snapshot = JSON.parse(stdout) as {
      entries: Array<{
        taskId: string;
        agent?: string;
        phase?: string;
        files: string[];
        startedAt?: string;
        recentNotes?: Array<{ message: string; agent?: string; timestamp: string }>;
      }>;
      generatedAt?: string;
    };
    expect(Array.isArray(snapshot.entries)).toBe(true);
    expect(snapshot.entries.length).toBeGreaterThanOrEqual(1);
    const entry = snapshot.entries.find((e) => e.taskId === taskId) ?? snapshot.entries[0];
    expect(entry.taskId).toBeDefined();
    expect(Array.isArray(entry.files)).toBe(true);
    expect(snapshot.generatedAt).toBeDefined();
  });

  it("tg context without taskId and without --hive exits with error", async () => {
    if (!context) throw new Error("Context not initialized");

    const { exitCode, stderr } = await runTgCli(`context`, context.tempDir);
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/Task ID is required|argument|taskId/i);
  });
});
