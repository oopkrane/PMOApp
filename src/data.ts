import Papa from "papaparse";
import {
  COLUMN_NAMES,
  CsvRowSchema,
  TaskListSchema,
  type CsvRow,
  type Task,
} from "./types";

const STORAGE_KEY = "pmo-workspace.tasks.v1";

export function parseCsv(csv: string): Task[] {
  const parsed = Papa.parse<Record<string, unknown>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
  });
  if (parsed.errors.length > 0) {
    throw new Error(
      `The CSV could not be read: ${parsed.errors[0]?.message ?? "Unknown error"}`,
    );
  }
  const receivedColumns = parsed.meta.fields ?? [];
  const missingColumns = COLUMN_NAMES.filter(
    (column) => !receivedColumns.includes(column),
  );
  if (missingColumns.length > 0) {
    throw new Error(
      `The CSV is missing required columns: ${missingColumns.join(", ")}`,
    );
  }
  return parsed.data.map((untrustedRow, index) => {
    const result = CsvRowSchema.safeParse(untrustedRow);
    if (!result.success)
      throw new Error(
        `Row ${index + 2} does not match the expected project schema.`,
      );
    return { ...result.data, _key: createKey(result.data, index) };
  });
}

function createKey(row: CsvRow, index: number): string {
  return `${row.ID.trim() || `row-${index + 1}`}-${index}`;
}

export async function loadSeedTasks(): Promise<Task[]> {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const validated = TaskListSchema.safeParse(JSON.parse(saved) as unknown);
      if (validated.success) return validated.data;
    } catch {
      // Restore from the validated seed when browser data is corrupt.
    }
  }
  const response = await fetch("/data/pmo-actions.csv");
  if (!response.ok)
    throw new Error("The bundled project data could not be loaded.");
  return parseCsv(await response.text());
}

export function saveTasks(tasks: Task[]): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(TaskListSchema.parse(tasks)),
  );
}

export function clearSavedTasks(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function exportCsv(tasks: Task[]): string {
  return Papa.unparse(
    tasks.map(({ _key: _ignored, ...row }) => row),
    { columns: [...COLUMN_NAMES] },
  );
}
