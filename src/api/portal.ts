/** The portal: a pasted attendance page, and the snapshots it leaves. */

import type { PortalSnapshot, PortalSnapshotHistory } from "@acadkit/core/types";
import { supabase } from "@/lib/supabase";
import { isMissingTable, throwIf } from "@/api/db";

/** Write what was parsed out of a pasted portal page. */
/** A pasted attendance page's totals, saved as each subject's snapshot and its history. Returns how many subjects. */
export async function importPortalAttendance(
  pin: string,
  attendance: Array<{ subject_code: string; conducted: number; absent: number; percentage: number | null }>
): Promise<number> {
  if (!attendance.length) return 0;
  const today = new Date().toLocaleDateString("en-CA");
  const rows = attendance.map((a) => ({
    device_id: pin,
    subject_code: a.subject_code,
    conducted: a.conducted,
    absent: a.absent,
    percentage: a.percentage,
    as_of: today,
    synced_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("portal_snapshots").upsert(rows, { onConflict: "device_id,subject_code" });
  throwIf(error);
  await appendSnapshotHistory(rows, "paste");
  return rows.length;
}

/** Per-subject attendance totals as the portal last reported them. */
export async function fetchPortalSnapshots(pin: string): Promise<PortalSnapshot[]> {
  const { data, error } = await supabase
    .from("portal_snapshots")
    .select("*")
    .eq("device_id", pin);
  if (isMissingTable(error)) return [];
  throwIf(error);
  return data ?? [];
}

/**
 * Every sync, kept (migration 029). portal_snapshots is overwritten each
 * time; this is the series the anomaly checks read. A project that
 * hasn't run 029 simply keeps no history.
 */
export async function appendSnapshotHistory(
  rows: Array<Omit<PortalSnapshotHistory, "id" | "source">>,
  source: PortalSnapshotHistory["source"]
): Promise<void> {
  if (!rows.length) return;
  const { error } = await supabase
    .from("portal_snapshot_history")
    .insert(rows.map((r) => ({ ...r, source })));
  if (!isMissingTable(error)) throwIf(error);
}

export async function fetchSnapshotHistory(pin: string): Promise<PortalSnapshotHistory[]> {
  const { data, error } = await supabase
    .from("portal_snapshot_history")
    .select("*")
    .eq("device_id", pin)
    .order("synced_at", { ascending: true });
  if (isMissingTable(error)) return [];
  throwIf(error);
  return data ?? [];
}

export async function clearPortalSnapshots(pin: string): Promise<void> {
  const { error } = await supabase.from("portal_snapshots").delete().eq("device_id", pin);
  if (!isMissingTable(error)) throwIf(error);
}
