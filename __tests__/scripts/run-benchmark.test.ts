import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("run-benchmark script smoke test", () => {
  it("should output valid JSON with correct fields for a simple command", () => {
    const result = spawnSync(
     "bun",
      ["scripts/run-benchmark.ts", "echo hello"],
      { encoding: "utf-8" },
    );
    expect(result.status).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    const entry = data[0];
    expect(entry).toHaveProperty("command", "echo hello");
    expect(entry).toHaveProperty("exitCode", 0);
    expect(typeof entry.durationMs).toBe("number");
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
  });
});
