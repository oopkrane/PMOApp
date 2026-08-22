import type { Task } from "./types";

export function nextSequentialId(tasks: Pick<Task, "ID">[]): string {
  let highest = 0n;

  for (const task of tasks) {
    const id = task.ID.trim();
    if (!/^\d+$/.test(id)) continue;

    const numericId = BigInt(id);
    if (numericId > highest) highest = numericId;
  }

  return (highest + 1n).toString();
}
