import { supabase } from "@/lib/supabase";

/** The account's private token for the feeds (migration 047, supabase/functions/feeds). */
export interface FeedToken {
  token: string;
  created_at: string;
  last_used_at: string | null;
}

/** The Shortcuts the Mac builds for the token (scripts/lib/shortcuts.mjs). */
export const SHORTCUTS = ["AcadKit Alarm", "AcadKit Focus", "AcadKit Leave", "AcadKit", "AcadKit Screenshot"] as const;
export type ShortcutName = (typeof SHORTCUTS)[number];

const missingTable = (error: { code?: string } | null) => error?.code === "42P01" || error?.code === "PGRST205";

export async function fetchFeedToken(pin: string): Promise<FeedToken | null> {
  const { data, error } = await supabase.from("feed_tokens").select("token, created_at, last_used_at").eq("device_id", pin).maybeSingle();
  if (missingTable(error)) return null;
  if (error) throw new Error(error.message);
  return data;
}

/** A new token: the database makes it, so only the PIN is sent. */
export async function createFeedToken(pin: string): Promise<FeedToken> {
  const { data, error } = await supabase.from("feed_tokens").insert({ device_id: pin }).select("token, created_at, last_used_at").single();
  if (error) throw new Error(error.message);
  return data;
}

/** Revoking is deleting: every link and Shortcut made with the token stops working at once. */
export async function revokeFeedToken(pin: string): Promise<void> {
  const { error } = await supabase.from("feed_tokens").delete().eq("device_id", pin);
  if (error) throw new Error(error.message);
}

/** The feeds' addresses for a token: today's JSON, the calendar, and the calendar as a webcal subscription. */
export function feedLinks(token: string, base: string = import.meta.env.VITE_SUPABASE_URL as string) {
  const root = `${base.replace(/\/$/, "")}/functions/v1/feeds`;
  const calendar = `${root}/calendar.ics?token=${token}`;
  return { today: `${root}/today?token=${token}`, calendar, webcal: calendar.replace(/^https?:/, "webcal:") };
}

/** A link that downloads one of the Mac's signed Shortcuts, or null until the Mac has built it. */
export async function shortcutLink(pin: string, name: ShortcutName): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("study-files")
    .createSignedUrl(`${pin}/shortcuts/${name}.shortcut`, 60 * 60, { download: `${name}.shortcut` });
  if (error) {
    if (/not.?found|does not exist/i.test(error.message)) return null;
    throw error;
  }
  return data.signedUrl;
}
