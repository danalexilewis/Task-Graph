import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseCursorPlan } from "../../src/plan-import/parser";

describe("parseCursorPlan benchmark flag", () => {
  it("parses benchmark true from frontmatter", () => {
    const content = `---
name: Test Plan
overview: "Test"
todos: []
benchmark: true
---
`;
    const tmp = path.join(os.tmpdir(), `plan-${Date.now()}.md`);
    fs.writeFileSync(tmp, content);
    const result = parseCursorPlan(tmp);
    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan.benchmark).toBe(true);
    fs.unlinkSync(tmp);
  });

  it("defaults benchmark to undefined when not specified", () => {
    const content = `---
name: Test Plan
overview: "Test"
todos: []
---
`;
    const tmp = path.join(os.tmpdir(), `plan2-${Date.now()}.md`);
    fs.writeFileSync(tmp, content);
    const result = parseCursorPlan(tmp);
    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan.benchmark).toBeUndefined();
    fs.unlinkSync(tmp);
  });
});
