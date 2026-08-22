import { describe, expect, it } from "vitest";
import {
  appendUpdateHistory,
  applyTaskUpdate,
  createDatedUpdate,
} from "./updates";
import type { Task } from "./types";

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

  it("atomically advances a task update and its history", () => {
    const task = {
      _key: "one",
      ID: "1",
      Action: "Test",
      Update: "20/08 Old update",
      "Update History": "19/08 Older update",
      "Email Subject": "",
      "Last edited time": "",
      Owner: "",
      Priority: "",
      Project: "Project",
      Status: "",
    } satisfies Task;
    const updated = applyTaskUpdate(task, "New update", new Date(2026, 7, 22));
    expect(updated.Update).toBe("22/08 New update");
    expect(updated["Update History"]).toBe(
      "19/08 Older update\n20/08 Old update",
    );
  });
});
