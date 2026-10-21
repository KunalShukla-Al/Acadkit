/** Deadlines and tests. */

import type { Deadline } from "@acadkit/core/types";
import { supabase } from "@/lib/supabase";
import { throwIf } from "@/api/db";

export async function fetchDeadlines(pin: string): Promise<Deadline[]> {
  const { data, error } = await supabase
    .from("deadlines")
    .select("*")
    .eq("device_id", pin)
    .order("due_date");
  throwIf(error);
  return data ?? [];
}

export async function insertDeadline(
  pin: string,
  deadline: Omit<Deadline, "device_id" | "created_at">
): Promise<void> {
  const { error } = await supabase.from("deadlines").insert({ ...deadline, device_id: pin });
  throwIf(error);
}

export async function updateDeadline(id: string, patch: Partial<Deadline>): Promise<void> {
  const { error } = await supabase.from("deadlines").update(patch).eq("id", id);
  throwIf(error);
}

export async function deleteDeadline(id: string): Promise<void> {
  const { error } = await supabase.from("deadlines").delete().eq("id", id);
  throwIf(error);
}
