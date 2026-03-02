import { afterAll, describe, expect, it } from "bun:test";
import { unlinkSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { parseCursorPlan } from "../../src/plan-import/parser";

describe("parseCursorPlan benchmark flag", () => {
  const testFilePath = path.join(__dirname, "test-cursor-benchmark.md");

  afterAll(() => {
    try {
      unlinkSync(testFilePath);
    } catch {}
  });

  it("should parse benchmark: true from frontmatter", () => {
    const content = `---
name: Benchmark Test
overview: "Test benchmark flag."
todos:
  - id: t1
    content: "Task 1"
benchmark: true
---
`;
    writeFileSync(testFilePath, content);
    const result = parseCursorPlan(testFilePath);
    expect(result.isOk()).toBe(true);
    const { benchmark } = result._unsafeUnwrap();
    expect(benchmark).toBe(true);
  });

  it("should default benchmark to undefined when absent", () => {
    const content = `---
name: NoBenchmark Test
overview: "Test no benchmark flag."
todos:
  - id: t2
    content: "Task 2"
---
`;
    writeFileSync(testFilePath, content);
    const result = parseCursorPlan(testFilePath);
    expect(result.isOk()).toBe(true);
    const { benchmark } = result._unsafeUnwrap();
    expect(benchmark).toBe(undefined);
  });
});
