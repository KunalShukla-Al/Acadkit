import { supabase } from "@/lib/supabase";
import type { AbsentRow } from "@acadkit/core/absent";
import type { AttendanceRecord } from "@acadkit/core/types";

/** What Siri marked (migration 051): the classes, and what each was before. */
export interface SiriMark {
  id: string;
  said: string;
  rows: AbsentRow[];
  created_at: string;
  undone_at: string | null;
}

/** How long a Siri mark offers Undo. */
export const UNDO_HOURS = 24;

const missingTable = (error: { code?: string } | null) => error?.code === "42P01" || error?.code === "PGRST205";

/** This account's Siri marks from the last day that haven't been undone, newest first. */
export async function fetchSiriMarks(pin: string, now = Date.now()): Promise<SiriMark[]> {
  const since = new Date(now - UNDO_HOURS * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from("siri_marks")
    .select("id, said, rows, created_at, undone_at")
    .eq("device_id", pin)
    .is("undone_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  if (missingTable(error)) return [];
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * The rows to put back: only classes still as Siri left them (absent, by
 * hand). One changed in the app since keeps its new mark.
 */
export function rowsToRestore(mark: SiriMark, attendance: AttendanceRecord[]): AbsentRow[] {
  return mark.rows.filter((r) => {
    const now = attendance.find((a) => a.subject_id === r.subject_id && a.date === r.date && a.start_time === r.start_time);
    return now?.status === "absent" && !now.auto_marked;
  });
}

/** Put the classes back as they were before Siri, then close the mark. */
export async function undoSiriMark(pin: string, mark: SiriMark, attendance: AttendanceRecord[]): Promise<void> {
  const rows = rowsToRestore(mark, attendance);
  const gone = rows.filter((r) => !r.before);
  const back = rows.filter((r) => r.before);
  for (const r of gone) {
    const { error } = await supabase.from("attendance").delete().eq("device_id", pin).eq("subject_id", r.subject_id).eq("date", r.date).eq("start_time", r.start_time);
    if (error) throw new Error(error.message);
  }
  if (back.length) {
    const { error } = await supabase.from("attendance").upsert(
      back.map((r) => ({ device_id: pin, subject_id: r.subject_id, date: r.date, start_time: r.start_time, end_time: r.end_time, status: r.before!.status, auto_marked: r.before!.auto_marked })),
      { onConflict: "device_id,subject_id,date,start_time" }
    );
    if (error) throw new Error(error.message);
  }
  const { error } = await supabase.from("siri_marks").update({ undone_at: new Date().toISOString() }).eq("id", mark.id);
  if (error) throw new Error(error.message);
}
