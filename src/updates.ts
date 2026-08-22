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
