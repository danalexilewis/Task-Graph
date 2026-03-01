import { execa } from "execa";

describe("stats command", () => {
  it("includes --benchmark option in help", async () => {
    const { stdout } = await execa("node", [
      "dist/cli/index.js",
      "stats",
      "--help",
    ]);
    expect(stdout).toContain("--benchmark");
  });
});
