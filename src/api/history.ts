/** What the app keeps of the past: archived semesters and the weekly forecasts. */

import type { ForecastLogRow, SemesterArchive } from "@acadkit/core/types";
import { supabase } from "@/lib/supabase";
import { isMissingTable, throwIf } from "@/api/db";

/** This week's forecasts; a week already logged keeps its first entry. */
export async function logForecasts(rows: ForecastLogRow[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await supabase
    .from("forecast_log")
    .upsert(rows, { onConflict: "device_id,week_start,scope", ignoreDuplicates: true });
  if (!isMissingTable(error)) throwIf(error);
}

export async function fetchForecasts(pin: string): Promise<ForecastLogRow[]> {
  const { data, error } = await supabase
    .from("forecast_log")
    .select("*")
    .eq("device_id", pin)
    .order("week_start", { ascending: true });
  if (isMissingTable(error)) return [];
  throwIf(error);
  return data ?? [];
}

export async function fetchArchives(pin: string): Promise<SemesterArchive[]> {
  const { data, error } = await supabase
    .from("semester_archives")
    .select("*")
    .eq("device_id", pin)
    .order("archived_at", { ascending: false });
  // Table may not exist yet (migration 010) - degrade to empty. Only
  // then: an empty history for a dropped request hides your CGPA ladder.
  if (isMissingTable(error)) return [];
  throwIf(error);
  return data ?? [];
}

export async function insertArchive(
  pin: string,
  // archived_at is set for a semester entered from a transcript, so it sorts by when it ended.
  archive: Omit<SemesterArchive, "id" | "device_id" | "archived_at"> & { archived_at?: string }
): Promise<void> {
  const { error } = await supabase
    .from("semester_archives")
    .insert({ ...archive, device_id: pin });
  throwIf(error);
}

export async function deleteArchive(id: string): Promise<void> {
  const { error } = await supabase.from("semester_archives").delete().eq("id", id);
  throwIf(error);
}
