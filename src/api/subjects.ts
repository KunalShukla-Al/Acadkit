/** Subjects: the courses this semester, each with its assessment plan. */

import type { Subject } from "@acadkit/core/types";
import { supabase } from "@/lib/supabase";
import { throwIf } from "@/api/db";

export async function fetchSubjects(pin: string): Promise<Subject[]> {
  const { data, error } = await supabase
    .from("subjects")
    .select("*")
    .eq("device_id", pin)
    .order("credits", { ascending: false })
    .order("code");
  throwIf(error);
  return data ?? [];
}

/** `id` is generated on the client and sent with the row, so the row the UI shows before the write lands is the one the server stores - an edit queued behind the insert while offline then targets a real row, not a placeholder id the database would reject. */
export async function insertSubject(
  pin: string,
  subject: Omit<Subject, "device_id" | "created_at">
): Promise<void> {
  const { error } = await supabase.from("subjects").insert({ ...subject, device_id: pin });
  throwIf(error);
}

export async function updateSubject(id: string, patch: Partial<Subject>): Promise<void> {
  const { error } = await supabase.from("subjects").update(patch).eq("id", id);
  throwIf(error);
}

export async function deleteSubject(id: string): Promise<void> {
  const { error } = await supabase.from("subjects").delete().eq("id", id);
  throwIf(error);
}
