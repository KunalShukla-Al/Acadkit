/** The timetable's slots by Day Order, and importing one read off the portal. */

import type { TimetableSlot } from "@acadkit/core/types";
import { supabase } from "@/lib/supabase";
import { replaceRows, throwIf } from "@/api/db";
import { fetchSubjects } from "@/api/subjects";

export async function fetchTimetable(pin: string): Promise<TimetableSlot[]> {
  const { data, error } = await supabase
    .from("timetable_slots")
    .select("*")
    .eq("device_id", pin)
    .order("day_order")
    .order("start_time");
  throwIf(error);
  return data ?? [];
}

export async function insertSlot(
  pin: string,
  slot: Omit<TimetableSlot, "device_id" | "created_at">
): Promise<void> {
  const { error } = await supabase.from("timetable_slots").insert({ ...slot, device_id: pin });
  throwIf(error);
}

export async function updateSlot(id: string, patch: Partial<TimetableSlot>): Promise<void> {
  const { error } = await supabase.from("timetable_slots").update(patch).eq("id", id);
  throwIf(error);
}

export async function deleteSlot(id: string): Promise<void> {
  const { error } = await supabase.from("timetable_slots").delete().eq("id", id);
  throwIf(error);
}

export async function clearTimetable(pin: string): Promise<void> {
  const { error } = await supabase.from("timetable_slots").delete().eq("device_id", pin);
  throwIf(error);
}

export interface TimetableImportResult {
  slots: number;
  /** Codes in the grid that matched no subject on this account. */
  unmatchedCodes: string[];
}

/** Replace the timetable with a grid read off the portal. */
export async function importTimetable(
  pin: string,
  slots: Array<{
    subject_code: string;
    day_order: number;
    start_time: string;
    end_time: string;
    slot_type: "theory" | "lab";
    room: string | null;
  }>
): Promise<TimetableImportResult> {
  const subjects = await fetchSubjects(pin);
  const byCode = new Map(subjects.map((s) => [s.code.trim().toUpperCase(), s.id]));

  const unmatched = new Set<string>();
  const rows = slots
    .map((sl) => {
      const id = byCode.get(sl.subject_code.trim().toUpperCase());
      if (!id) {
        unmatched.add(sl.subject_code);
        return null;
      }
      return {
        device_id: pin,
        subject_id: id,
        day_order: sl.day_order,
        // The DB column is a time; seconds keep it unambiguous.
        start_time: `${sl.start_time}:00`,
        end_time: `${sl.end_time}:00`,
        slot_type: sl.slot_type,
        room: sl.room,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Nothing matched: leave the timetable alone rather than clearing it
  // for an import that has nothing to put back.
  if (!rows.length) return { slots: 0, unmatchedCodes: [...unmatched] };

  await replaceRows("timetable_slots", pin, () => supabase.from("timetable_slots").insert(rows));
  return { slots: rows.length, unmatchedCodes: [...unmatched] };
}
