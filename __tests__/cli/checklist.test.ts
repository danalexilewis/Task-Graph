import { promptSelfReport } from "../../src/cli/checklist";

describe("checklist prompt module", () => {
  it("should export promptSelfReport function", () => {
    expect(typeof promptSelfReport).toBe("function");
  });
});
