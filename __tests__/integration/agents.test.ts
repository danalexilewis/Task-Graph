import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { jsonObj, query } from "../../src/db/query";
import {
  runTgCli,
  setupIntegrationTest,
  teardownIntegrationTest,
} from "./test-utils";

function toDatetime(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

describe.serial("Agents command integration (tg agents)", () => {
  let context: Awaited<ReturnType<typeof setupIntegrationTest>> | undefined;
  let planId: string;
  let taskId1: string;
  let taskId2: string;

  beforeAll(async () => {
    context = await setupIntegrationTest();
    const plansDir = path.join(context.tempDir, "plans");
    fs.mkdirSync(plansDir, { recursive: true });

    const planContent = `---
name: Agents Test Plan
overview: "Plan for tg agents integration tests."
todos:
  - id: agents-task-1
    content: "Agents task 1"
    status: pending
  - id: agents-task-2
    content: "Agents task 2"
    status: pending
---
`;
    fs.writeFileSync(path.join(plansDir, "agents-test-plan.md"), planContent);

    const { stdout: importOut } = await runTgCli(
      `import plans/agents-test-plan.md --plan "Agents Test Plan" --format cursor --no-commit`,
      context.tempDir,
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
    const plan = plans.find((p) => p.title === "Agents Test Plan");
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
    const t1 = nextTasks.find((t) => t.title === "Agents task 1");
    const t2 = nextTasks.find((t) => t.title === "Agents task 2");
    expect(t1).toBeDefined();
    expect(t2).toBeDefined();
    taskId1 = t1?.task_id ?? "";
    taskId2 = t2?.task_id ?? "";
  }, 60000);

  afterAll(async () => {
    if (context) await teardownIntegrationTest(context);
  });

  it("no doing tasks returns agents: []", async () => {
    if (!context) throw new Error("Context not initialized");

    const { exitCode, stdout } = await runTgCli(
      `agents --json`,
      context.tempDir,
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout) as { agents: unknown[] };
    expect(Array.isArray(parsed.agents)).toBe(true);
    expect(parsed.agents).toHaveLength(0);
  });

  it("one doing task with no heartbeat: phase null, files []", async () => {
    if (!context) throw new Error("Context not initialized");

    const q = query(context.doltRepoPath);
    const startedAt = toDatetime(new Date());

    // Put task1 into doing status and insert a started event
    await q
      .update(
        "task",
        { status: "doing", owner: "implementer-1" },
        { task_id: taskId1 },
      )
      .then((r) => r._unsafeUnwrap());
    await q
      .insert("event", {
        event_id: uuidv4(),
        task_id: taskId1,
        kind: "started",
        body: jsonObj({ agent: "implementer-1", timestamp: startedAt }),
        created_at: startedAt,
      })
      .then((r) => r._unsafeUnwrap());

    const { exitCode, stdout } = await runTgCli(
      `agents --json`,
      context.tempDir,
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout) as {
      agents: Array<{
        agent: string;
        task_id: string;
        phase: string | null;
        files: string[];
      }>;
    };
    expect(parsed.agents).toHaveLength(1);
    const entry = parsed.agents[0];
    expect(entry.agent).toBe("implementer-1");
    expect(entry.task_id).toBe(taskId1);
    expect(entry.phase).toBeNull();
    expect(entry.files).toEqual([]);
  });

  it("one doing task with heartbeat: correct phase and files", async () => {
    if (!context) throw new Error("Context not initialized");

    const q = query(context.doltRepoPath);
    const heartbeatAt = toDatetime(new Date());

    // Insert a heartbeat note for task1
    await q
      .insert("event", {
        event_id: uuidv4(),
        task_id: taskId1,
        kind: "note",
        body: jsonObj({
          message: {
            type: "heartbeat",
            agent: "implementer-1",
            phase: "mid-work",
            files: ["src/cli/agents.ts", "src/cli/index.ts"],
          },
          agent: "implementer-1",
          timestamp: heartbeatAt,
        }),
        created_at: heartbeatAt,
      })
      .then((r) => r._unsafeUnwrap());

    const { exitCode, stdout } = await runTgCli(
      `agents --json`,
      context.tempDir,
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout) as {
      agents: Array<{
        agent: string;
        task_id: string;
        phase: string | null;
        files: string[];
        last_heartbeat_at: string | null;
      }>;
    };
    expect(parsed.agents).toHaveLength(1);
    const entry = parsed.agents[0];
    expect(entry.phase).toBe("mid-work");
    expect(entry.files).toEqual(["src/cli/agents.ts", "src/cli/index.ts"]);
    expect(entry.last_heartbeat_at).not.toBeNull();
  });

  it("two doing tasks both appear with correct agents", async () => {
    if (!context) throw new Error("Context not initialized");

    const q = query(context.doltRepoPath);
    const startedAt = toDatetime(new Date());

    // Put task2 into doing status
    await q
      .update(
        "task",
        { status: "doing", owner: "implementer-2" },
        { task_id: taskId2 },
      )
      .then((r) => r._unsafeUnwrap());
    await q
      .insert("event", {
        event_id: uuidv4(),
        task_id: taskId2,
        kind: "started",
        body: jsonObj({ agent: "implementer-2", timestamp: startedAt }),
        created_at: startedAt,
      })
      .then((r) => r._unsafeUnwrap());

    const { exitCode, stdout } = await runTgCli(
      `agents --json`,
      context.tempDir,
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout) as {
      agents: Array<{ agent: string; task_id: string }>;
    };
    expect(parsed.agents.length).toBeGreaterThanOrEqual(2);
    const agentNames = parsed.agents.map((a) => a.agent);
    expect(agentNames).toContain("implementer-1");
    expect(agentNames).toContain("implementer-2");
  });

  it("human output renders table with agent names", async () => {
    if (!context) throw new Error("Context not initialized");

    const { exitCode, stdout } = await runTgCli(`agents`, context.tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("implementer-1");
    expect(stdout).toContain("implementer-2");
  });
});
