import Papa from "papaparse";
import { z } from "zod";
import {
  COLUMN_NAMES,
  CsvRowSchema,
  TaskListSchema,
  type CsvRow,
  type Task,
} from "./types";

const LEGACY_STORAGE_KEY = "pmo-workspace.tasks.v1";
const BACKUP_STORAGE_KEY = "pmo-workspace.tasks.v2";
const DATABASE_NAME = "pmo-workspace";
const DATABASE_VERSION = 1;
const TASK_STORE = "workspace-state";
const TASK_RECORD_KEY = "tasks";

const PersistedTaskStateSchema = z.object({
  version: z.literal(2),
  savedAt: z.number().int().nonnegative(),
  tasks: TaskListSchema,
});

type PersistedTaskState = z.infer<typeof PersistedTaskStateSchema>;
let writeQueue = Promise.resolve();

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
  const indexedState = await readIndexedState();
  const backupState = readBackupState();
  const newestState = [indexedState, backupState]
    .filter((state): state is PersistedTaskState => state !== null)
    .sort((left, right) => right.savedAt - left.savedAt)[0];
  if (newestState) {
    await writeIndexedState(newestState).catch(() => undefined);
    return newestState.tasks;
  }

  const legacyTasks = readLegacyTasks();
  if (legacyTasks) {
    await saveTasks(legacyTasks);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    return legacyTasks;
  }

  const response = await fetch("/data/pmo-actions.csv");
  if (!response.ok)
    throw new Error("The bundled project data could not be loaded.");
  return parseCsv(await response.text());
}

export function saveTasks(tasks: Task[]): Promise<void> {
  const state: PersistedTaskState = {
    version: 2,
    savedAt: Date.now(),
    tasks: TaskListSchema.parse(tasks),
  };
  window.localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(state));
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(() => writeIndexedState(state));
  return writeQueue;
}

export async function clearSavedTasks(): Promise<void> {
  window.localStorage.removeItem(BACKUP_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  await writeQueue.catch(() => undefined);
  await deleteIndexedState();
}

export async function requestPersistentTaskStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export function exportCsv(tasks: Task[]): string {
  return Papa.unparse(
    tasks.map(({ _key: _ignored, ...row }) => row),
    { columns: [...COLUMN_NAMES] },
  );
}

function readBackupState(): PersistedTaskState | null {
  try {
    const value = window.localStorage.getItem(BACKUP_STORAGE_KEY);
    if (!value) return null;
    const result = PersistedTaskStateSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function readLegacyTasks(): Task[] | null {
  try {
    const value = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!value) return null;
    const result = TaskListSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

async function readIndexedState(): Promise<PersistedTaskState | null> {
  try {
    const database = await openTaskDatabase();
    if (!database) return null;
    const value = await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction(TASK_STORE, "readonly");
      const request = transaction.objectStore(TASK_STORE).get(TASK_RECORD_KEY);
      request.onsuccess = () => resolve(request.result as unknown);
      request.onerror = () => reject(request.error);
    });
    database.close();
    const result = PersistedTaskStateSchema.safeParse(value);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

async function writeIndexedState(state: PersistedTaskState): Promise<void> {
  const database = await openTaskDatabase();
  if (!database) return;
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(TASK_STORE, "readwrite");
    transaction.objectStore(TASK_STORE).put(state, TASK_RECORD_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

async function deleteIndexedState(): Promise<void> {
  try {
    const database = await openTaskDatabase();
    if (!database) return;
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(TASK_STORE, "readwrite");
      transaction.objectStore(TASK_STORE).delete(TASK_RECORD_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  } catch {
    // A missing IndexedDB database does not prevent clearing the local backup.
  }
}

function openTaskDatabase(): Promise<IDBDatabase | null> {
  if (!window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(TASK_STORE)) {
        request.result.createObjectStore(TASK_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Task storage is blocked."));
  });
}
