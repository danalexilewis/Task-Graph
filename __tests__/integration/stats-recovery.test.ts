import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { jsonObj, query, now } from "../../src/db/query";
import { runTgCli, setupIntegrationTest, teardownIntegrationTest } from "./test-utils";

// Integration test for recovery metrics in tg stats
describe.serial("Recovery metrics integration (tg stats --recovery)", () => {
  let context: Awaited<ReturnType<typeof setupIntegrationTest>>;
  let planId: string;
  beforeAll(async () => {
    context = await setupIntegrationTest();
    const plansDir = path.join(context.tempDir, "plans");
    fs.mkdirSync(plansDir, { recursive: true });
    const planContent = `---
name: Recovery Test Plan
overview: "Plan to test recovery metrics."
todos:
  - id: run-full-suite
    content: "Run full suite"
    status: pending
---
`;
    fs.writeFileSync(path.join(plansDir, "recovery-plan.md"), planContent);
    // Import plan
    await runTgCli(
      `import plans/recovery-plan.md --plan "Recovery Test Plan" --format cursor --no-commit`,
      context.tempDir,
    );
    // Get plan ID
    const { stdout: listOut } = await runTgCli(
      `plan list --json`,
      context.tempDir,
    );
    const plans = JSON.parse(listOut) as Array<{ plan_id: string; title: string }>;
    planId = plans.find((p) => p.title === "Recovery Test Plan")!.plan_id;
    // Insert events: failure then pass for run-full-suite task
    const { stdout: nextOut } = await runTgCli(
      `next --plan ${planId} --json`,
      context.tempDir,
    );
    const tasks = JSON.parse(nextOut) as Array<{ task_id: string }>; 
    const taskId = tasks[0].task_id;
    const q = query(context.doltRepoPath);
    const t0 = now();
    // gate:full failed
    await q.insert("event", {
      event_id: uuidv4(),
      task_id: taskId,
      kind: "done",
      body: jsonObj({ evidence: "gate:full failed", timestamp: toDatetime(t0) }),
      created_at: toDatetime(t0),
    }).then((r) => r._unsafeUnwrap());
    // gate:full passed later
    const t1 = new Date(t0.getTime() + 60 * 1000);
    await q.insert("event", {
      event_id: uuidv4(),
      task_id: taskId,
      kind: "done",
      body: jsonObj({ evidence: "gate:full passed", timestamp: toDatetime(t1) }),
      created_at: toDatetime(t1),
    }).then((r) => r._unsafeUnwrap());
  });

  afterAll(async () => {
    await teardownIntegrationTest(context);
  });

  it("includes recovery stats in JSON output", async () => {
    const { exitCode, stdout } = await runTgCli(
      `stats --recovery --json`,
      context.tempDir,
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout) as {
      agent_metrics: unknown[];
      recovery: { plans_with_failure: number; plans_fixed: number; fix_rate: number | null };
    };
    expect(parsed.recovery).toBeDefined();
    expect(parsed.recovery.plans_with_failure).toBe(1);
    expect(parsed.recovery.plans_fixed).toBe(1);
    expect(parsed.recovery.fix_rate).toBeCloseTo(1.0);
  });
});

function toDatetime(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}