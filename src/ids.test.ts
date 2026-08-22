import { describe, expect, it } from "vitest";
import { nextSequentialId } from "./ids";

describe("sequential action IDs", () => {
  it("increments from the highest current numeric ID", () => {
    expect(nextSequentialId([{ ID: "249" }, { ID: "17" }])).toBe("250");
  });

  it("returns digits only and ignores legacy non-numeric IDs", () => {
    const next = nextSequentialId([{ ID: "NEW-999" }, { ID: "41" }]);
    expect(next).toBe("42");
    expect(next).toMatch(/^\d+$/);
  });

  it("starts at one when there are no existing numeric IDs", () => {
    expect(nextSequentialId([])).toBe("1");
  });
});
