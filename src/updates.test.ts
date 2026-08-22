import { describe, expect, it } from "vitest";
import { appendUpdateHistory, createDatedUpdate } from "./updates";

describe("task update history", () => {
  it("prefixes a new update with dd/mm", () => {
    expect(createDatedUpdate("Work started", new Date(2026, 7, 22))).toBe(
      "22/08 Work started",
    );
  });

  it("appends the previous current update to existing history", () => {
    expect(
      appendUpdateHistory("20/08 Initial review", "21/08 Approval received"),
    ).toBe("20/08 Initial review\n21/08 Approval received");
  });

  it("does not add a blank previous update to history", () => {
    expect(appendUpdateHistory("20/08 Existing", "   ")).toBe("20/08 Existing");
  });
});
