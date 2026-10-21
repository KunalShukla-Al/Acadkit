import { supabase } from "@/lib/supabase";
import { throwIf } from "@/api/db";
import type { MarkComponentType, MarkSource, PortalSnapshot } from "@acadkit/core/types";

/**
 * What a portal screenshot's import changed (migration 059), with every
 * row as it was before; null for a row it added.
 */
export interface PortalChanges {
  snapshots: { code: string; before: Pick<PortalSnapshot, "subject_code" | "conducted" | "absent" | "percentage" | "as_of" | "synced_at"> | null }[];
  history: string[];
  marks: { id: string; before: { label: string; source: MarkSource; component_type: MarkComponentType; marks_obtained: number; max_marks: number } | null }[];
}

/**
 * What Autopilot did, with the file it read: the deadlines a notice added
 * (migration 053), or what a portal screenshot changed (migration 059).
 */
export interface AutopilotAction {
  id: string;
  kind: "notice" | "portal";
  /** "Inbox/IMG_2041.jpg" or "Downloads/notice.pdf". */
  source: string;
  said: string;
  confidence: number;
  deadline_ids: string[];
  changes: PortalChanges | null;
  created_at: string;
  undone_at: string | null;
}

/** How long an Autopilot action offers Undo. */
export const UNDO_DAYS = 3;

const missingTable = (error: { code?: string } | null) => error?.code === "42P01" || error?.code === "PGRST205";

/** This account's Autopilot actions from the last few days that haven't been undone, newest first. */
export async function fetchAutopilotActions(pin: string, now = Date.now()): Promise<AutopilotAction[]> {
  const since = new Date(now - UNDO_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("autopilot_actions")
    .select("id, kind, source, said, confidence, deadline_ids, changes, created_at, undone_at")
    .eq("device_id", pin)
    .is("undone_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  if (missingTable(error)) return [];
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** A portal import put back: each snapshot and mark as it was, and what it added gone. */
async function undoPortal(pin: string, changes: PortalChanges): Promise<void> {
  const restore = changes.snapshots.flatMap((s) => (s.before ? [{ device_id: pin, ...s.before }] : []));
  const added = changes.snapshots.filter((s) => !s.before).map((s) => s.code);
  if (restore.length) throwIf((await supabase.from("portal_snapshots").upsert(restore, { onConflict: "device_id,subject_code" })).error);
  if (added.length) throwIf((await supabase.from("portal_snapshots").delete().eq("device_id", pin).in("subject_code", added)).error);
  if (changes.history.length) throwIf((await supabase.from("portal_snapshot_history").delete().eq("device_id", pin).in("id", changes.history)).error);
  for (const m of changes.marks.filter((m) => m.before)) {
    throwIf((await supabase.from("marks").update(m.before!).eq("device_id", pin).eq("id", m.id)).error);
  }
  const newMarks = changes.marks.filter((m) => !m.before).map((m) => m.id);
  if (newMarks.length) throwIf((await supabase.from("marks").delete().eq("device_id", pin).in("id", newMarks)).error);
}

/**
 * Take back what Autopilot did, then close the action: a notice's deadlines
 * (one already ticked off stays), or a portal import's changes.
 */
export async function undoAutopilotAction(pin: string, action: AutopilotAction): Promise<void> {
  if (action.kind === "portal" && action.changes) await undoPortal(pin, action.changes);
  else if (action.deadline_ids.length) {
    const { error } = await supabase.from("deadlines").delete().eq("device_id", pin).eq("status", "pending").in("id", action.deadline_ids);
    if (error) throw new Error(error.message);
  }
  const { error } = await supabase.from("autopilot_actions").update({ undone_at: new Date().toISOString() }).eq("id", action.id);
  if (error) throw new Error(error.message);
}
