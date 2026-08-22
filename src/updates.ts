export function createDatedUpdate(update: string, date = new Date()): string {
  const trimmedUpdate = update.trim();
  if (!trimmedUpdate) return "";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month} ${trimmedUpdate}`;
}

export function appendUpdateHistory(
  existingHistory: string,
  previousUpdate: string,
): string {
  const history = existingHistory.trim();
  const previous = previousUpdate.trim();
  if (!previous) return history;

  return history ? `${history}\n${previous}` : previous;
}

export function applyTaskUpdate(
  task: Task,
  update: string,
  date = new Date(),
): Task {
  const datedUpdate = createDatedUpdate(update, date);
  if (!datedUpdate) return task;
  return {
    ...task,
    Update: datedUpdate,
    "Update History": appendUpdateHistory(task["Update History"], task.Update),
    "Last edited time": new Date().toISOString(),
  };
}
import type { Task } from "./types";
