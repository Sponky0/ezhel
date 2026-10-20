type MessageRow = { id: string; created_at: string; deleted_at: string | null };

// Merge server history and live events without losing a message received mid-fetch.
export function mergeMessages<T extends MessageRow>(history: T[], live: T[]): T[] {
  const rows = new Map<string, T>();
  for (const row of [...history, ...live]) rows.set(row.id, row);
  return [...rows.values()]
    .filter(row => !row.deleted_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}
