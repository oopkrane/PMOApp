// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSavedTasks,
  exportCsv,
  loadSeedTasks,
  parseCsv,
  saveTasks,
} from "./data";
import { COLUMN_NAMES, DISPLAY_COLUMNS, columnLabel } from "./types";

const header = COLUMN_NAMES.map((column) => `"${column}"`).join(",");
const validRow = [
  "Prepare launch plan",
  "Launch plan",
  "A-1",
  "2026-08-22",
  "Alex",
  "High",
  "Launch",
  "In progress",
  "Draft ready",
  "Created",
]
  .map((value) => `"${value}"`)
  .join(",");

beforeEach(async () => {
  window.localStorage.clear();
  await clearSavedTasks();
});

describe("CSV data boundary", () => {
  it("uses the requested display order and history label", () => {
    expect(DISPLAY_COLUMNS.slice(0, 7)).toEqual([
      "ID",
      "Action",
      "Update",
      "Owner",
      "Priority",
      "Project",
      "Status",
    ]);
    expect(columnLabel("Update History")).toBe("Action History");
  });

  it("preserves every source column and row", () => {
    const tasks = parseCsv(`${header}\n${validRow}`);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.Action).toBe("Prepare launch plan");
    expect(Object.keys(tasks[0] ?? {}).filter((key) => key !== "_key")).toEqual(
      [...COLUMN_NAMES],
    );
    expect(exportCsv(tasks)).toContain("Update History");
  });

  it("rejects input that omits a required column", () => {
    expect(() => parseCsv("Action,Status\nTest,Done")).toThrow(
      "missing required columns",
    );
  });

  it("treats spreadsheet-like values as inert data", () => {
    const row = validRow.replace("Prepare launch plan", "=1+1");
    expect(parseCsv(`${header}\n${row}`)[0]?.Action).toBe("=1+1");
  });

  it("persists every action and update in the versioned durable store", async () => {
    const tasks = parseCsv(`${header}\n${validRow}`);
    tasks[0]!.Update = "23/08 Durable update";
    tasks[0]!["Update History"] = "22/08 Previous update";

    await saveTasks(tasks);
    const restored = await loadSeedTasks();

    expect(restored).toEqual(tasks);
    expect(restored[0]?.Update).toBe("23/08 Durable update");
    expect(restored[0]?.["Update History"]).toBe("22/08 Previous update");
  });

  it("migrates the existing localStorage action list without data loss", async () => {
    const tasks = parseCsv(`${header}\n${validRow}`);
    window.localStorage.setItem(
      "pmo-workspace.tasks.v1",
      JSON.stringify(tasks),
    );

    expect(await loadSeedTasks()).toEqual(tasks);
    expect(window.localStorage.getItem("pmo-workspace.tasks.v1")).toBeNull();
    expect(
      window.localStorage.getItem("pmo-workspace.tasks.v2"),
    ).not.toBeNull();
  });
});
