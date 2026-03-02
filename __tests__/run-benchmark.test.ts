import { spawnSync } from "node:child_process";
import path from "node:path";

test("run-benchmark smoke", () => {
  const scriptPath = path.resolve(__dirname, "../scripts/run-benchmark.ts");
  const result = spawnSync("bun", [scriptPath, "echo hello"], {
    encoding: "utf-8",
  });
  expect(result.status).toBe(0);
  const data = JSON.parse(result.stdout);
  expect(Array.isArray(data)).toBe(true);
  expect(data[0].command).toBe("echo hello");
  expect(typeof data[0].durationMs).toBe("number");
  expect(data[0].exitCode).toBe(0);
});
