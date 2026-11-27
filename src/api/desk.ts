/**
 * The Desk's files in the bucket (scripts/lib/desk.mjs), its progress
 * (migration 065), and Ask Claude's requests and answers in the inbox
 * (scripts/desk-ask.mjs answers them on the Mac).
 */

import { supabase } from "@/lib/supabase";
import { isMissingTable, throwIf } from "@/api/db";
import { storedJson } from "@/api/studyFiles";
import type { DeskIndex, DeskProgress } from "@/lib/desk";

const BUCKET = "study-files";

/** The Desk's index, or null before the first sync has written one. */
export function fetchDesk(pin: string): Promise<DeskIndex | null> {
  return storedJson<DeskIndex>(`${pin}/desk.json`);
}

const COLUMNS = "item_key, status, flag, pick, attempted_at, result, note, updated_at";

/** Every progress row. A project that hasn't run 065 has none, rather than an error on every visit. */
export async function fetchDeskProgress(pin: string): Promise<DeskProgress[]> {
  const { data, error } = await supabase.from("desk_progress").select(COLUMNS).eq("device_id", pin);
  if (isMissingTable(error)) return [];
  throwIf(error);
  return (data ?? []) as DeskProgress[];
}

/** One item's whole row: the hook merges a change into the row it has before it is queued. */
export async function setDeskProgress(pin: string, row: DeskProgress): Promise<void> {
  const { error } = await supabase.from("desk_progress").upsert({ device_id: pin, ...row }, { onConflict: "device_id,item_key" });
  throwIf(error);
}

export interface AskRequest {
  id: string;
  item: string;
  prompt: string;
  thread: { role: "user" | "assistant"; text: string }[];
  at: number;
}

export interface AskAnswer {
  id: string;
  text: string;
  status: string | null;
  done: boolean;
  error: string | null;
  at: number;
}

/**
 * Queues a question for the Mac. The app may only add files to its own
 * inbox (migration 033), so every question, follow-ups included, is a new file.
 */
export async function sendAsk(pin: string, req: AskRequest): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`${pin}/inbox/ask/${req.id}.json`, JSON.stringify(req), { contentType: "application/json" });
  throwIf(error);
}

/** The Mac's answer so far, or null before it has started. */
export function fetchAskAnswer(pin: string, id: string): Promise<AskAnswer | null> {
  return storedJson<AskAnswer>(`${pin}/ask/${id}.json`);
}

/** When the Mac's listener last looked at the inbox, in ms, or null if it never has. */
export async function fetchAskHeartbeat(pin: string): Promise<number | null> {
  const beat = await storedJson<{ at: number }>(`${pin}/ask/heartbeat.json`);
  return beat?.at ?? null;
}
