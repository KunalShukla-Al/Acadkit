/** The timetable's slots by Day Order. */

import type { TimetableSlot } from "@acadkit/core/types";
import { supabase } from "@/lib/supabase";
import { throwIf } from "@/api/db";

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
