/** What the query modules share: throwing on an error, telling a missing table apart, and swapping a PIN's rows. */

import { supabase } from "@/lib/supabase";

export function throwIf(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/** The table isn't there at all: a project that hasn't run its migration. */
export function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

/**
 * Swap this PIN's rows in `table` for the ones `insert` writes, inserting
 * before deleting: if the insert is rejected, the old rows are still there.
 * Deleting first meant a failed import left you with no timetable at all.
 * The caller does the insert, so its rows are checked against that table.
 */
export async function replaceRows(
  table: "timetable_slots" | "deadlines",
  pin: string,
  insert: () => PromiseLike<{ error: { message: string } | null }>
): Promise<void> {
  const { data: old, error } = await supabase.from(table).select("id").eq("device_id", pin);
  throwIf(error);
  const { error: insErr } = await insert();
  throwIf(insErr);
  const ids = (old ?? []).map((r) => r.id as string);
  // Chunked: every id rides in the URL.
  for (let i = 0; i < ids.length; i += 100) {
    const { error: delErr } = await supabase.from(table).delete().in("id", ids.slice(i, i + 100));
    throwIf(delErr);
  }
}
