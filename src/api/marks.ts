/** Marks: each internal component, as typed in or from the portal. */

import type { Mark } from "@acadkit/core/types";
import { supabase } from "@/lib/supabase";
import { throwIf } from "@/api/db";

export async function fetchMarks(pin: string): Promise<Mark[]> {
  const { data, error } = await supabase
    .from("marks")
    .select("*")
    .eq("device_id", pin)
    .order("added_at");
  throwIf(error);
  return data ?? [];
}

export async function insertMark(
  pin: string,
  mark: Omit<Mark, "device_id" | "added_at">
): Promise<void> {
  const { error } = await supabase.from("marks").insert({ ...mark, device_id: pin });
  throwIf(error);
}

export async function updateMark(id: string, patch: Partial<Mark>): Promise<void> {
  const { error } = await supabase.from("marks").update(patch).eq("id", id);
  throwIf(error);
}

export async function deleteMark(id: string): Promise<void> {
  const { error } = await supabase.from("marks").delete().eq("id", id);
  throwIf(error);
}
