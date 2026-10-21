/** The portal: a pasted page's attendance and marks, and the snapshots it leaves. */

import { planPortalMarks } from "@acadkit/core/portalMarks";
import type { MarkComponentType, PortalSnapshot, PortalSnapshotHistory } from "@acadkit/core/types";
import { supabase } from "@/lib/supabase";
import { isMissingTable, throwIf } from "@/api/db";

/** Write what was parsed out of a pasted portal page. */
export interface PortalImportResult {
  snapshots: number;
  marksAdded: number;
  marksUpdated: number;
  /** Codes the portal reported that no subject in AcadKit matches. */
  unmatchedCodes: string[];
}

export async function importPortalData(
  pin: string,
  input: {
    attendance: Array<{
      subject_code: string;
      conducted: number;
      absent: number;
      percentage: number | null;
    }>;
    marks: Array<{
      subject_code: string;
      label: string;
      max_marks: number;
      marks_obtained: number;
      component_type: MarkComponentType;
    }>;
  }
): Promise<PortalImportResult> {
  const today = new Date().toLocaleDateString("en-CA");
  const result: PortalImportResult = {
    snapshots: 0,
    marksAdded: 0,
    marksUpdated: 0,
    unmatchedCodes: [],
  };

  if (input.attendance.length) {
    const rows = input.attendance.map((a) => ({
      device_id: pin,
      subject_code: a.subject_code,
      conducted: a.conducted,
      absent: a.absent,
      percentage: a.percentage,
      as_of: today,
      synced_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("portal_snapshots")
      .upsert(rows, { onConflict: "device_id,subject_code" });
    throwIf(error);
    result.snapshots = rows.length;
    await appendSnapshotHistory(rows, "paste");
  }

  if (input.marks.length) {
    // Both reads are checked: a failed one used to come back as "no
    // subjects" (every code reported unmatched) or "no portal marks yet"
    // (every mark inserted again, into the unique index).
    const { data: subjects, error: subErr } = await supabase.from("subjects").select("id,code").eq("device_id", pin);
    throwIf(subErr);
    const { data: existing, error: exErr } = await supabase
      .from("marks")
      .select("id,subject_id,label,source")
      .eq("device_id", pin)
      .eq("is_external", false);
    throwIf(exErr);
    const { updates, inserts, unmatched } = planPortalMarks(pin, input.marks, subjects ?? [], existing ?? []);
    // Two requests, not one per mark.
    if (updates.length) {
      const { error } = await supabase.from("marks").upsert(updates, { onConflict: "id" });
      throwIf(error);
      result.marksUpdated = updates.length;
    }
    if (inserts.length) {
      const { error } = await supabase.from("marks").insert(inserts);
      throwIf(error);
      result.marksAdded = inserts.length;
    }
    result.unmatchedCodes = unmatched;
  }

  return result;
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
