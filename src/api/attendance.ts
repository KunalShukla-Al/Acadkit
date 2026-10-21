/** Attendance: classes marked by hand, auto-marked, or in a range. */

import type { AttendanceRecord, AttendanceStatus } from "@acadkit/core/types";
import { supabase } from "@/lib/supabase";
import { throwIf } from "@/api/db";

export async function fetchAttendance(pin: string): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("device_id", pin)
    .order("date", { ascending: false });
  throwIf(error);
  return data ?? [];
}

export async function upsertAttendance(
  pin: string,
  record: Omit<AttendanceRecord, "id" | "device_id">
): Promise<void> {
  const { error } = await supabase
    .from("attendance")
    .upsert(
      { ...record, device_id: pin },
      { onConflict: "device_id,subject_id,date,start_time" }
    );
  throwIf(error);
}

export async function deleteAttendance(
  pin: string,
  key: { subject_id: string; date: string; start_time: string }
): Promise<void> {
  const { error } = await supabase
    .from("attendance")
    .delete()
    .eq("device_id", pin)
    .eq("subject_id", key.subject_id)
    .eq("date", key.date)
    .eq("start_time", key.start_time);
  throwIf(error);
}

/** Write auto-marked `present` rows for past classes the user never touched. */
export async function insertAutoMarks(
  pin: string,
  rows: Array<Pick<AttendanceRecord, "subject_id" | "date" | "start_time" | "end_time">>
): Promise<number> {
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({
    ...r,
    device_id: pin,
    status: "present" as const,
    auto_marked: true,
  }));
  const { error } = await supabase
    .from("attendance")
    .upsert(payload, {
      onConflict: "device_id,subject_id,date,start_time",
      ignoreDuplicates: true,
    });
  throwIf(error);
  return rows.length;
}

/** Write one status across a stretch of classes. */
export async function markRange(
  pin: string,
  rows: Array<Pick<AttendanceRecord, "subject_id" | "date" | "start_time" | "end_time">>,
  status: AttendanceStatus,
  replace: boolean
): Promise<number> {
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({ ...r, device_id: pin, status, auto_marked: false }));
  const { error } = await supabase.from("attendance").upsert(payload, {
    onConflict: "device_id,subject_id,date,start_time",
    ignoreDuplicates: !replace,
  });
  throwIf(error);
  return rows.length;
}

/** Remove every auto-marked row, leaving hand-marked history untouched. */
export async function deleteAutoMarks(pin: string): Promise<void> {
  const { error } = await supabase
    .from("attendance")
    .delete()
    .eq("device_id", pin)
    .eq("auto_marked", true);
  throwIf(error);
}
