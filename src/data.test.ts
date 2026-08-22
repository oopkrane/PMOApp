import { describe, expect, it } from "vitest";
import { exportCsv, parseCsv } from "./data";
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
});
