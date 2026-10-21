import { supabase } from "@/lib/supabase";
import type { DeviceKind, Reading } from "@/lib/reading";

const missingTable = (error: { code?: string } | null) => error?.code === "42P01" || error?.code === "PGRST205";

/** Where you're reading now (migration 062): one row per account, the latest wins. */
export async function reportReading(pin: string, at: { path: string; page: number | null; kind: DeviceKind }): Promise<void> {
  const { error } = await supabase.from("reading_now").upsert({ device_id: pin, ...at, updated_at: new Date().toISOString() }, { onConflict: "device_id" });
  if (error && !missingTable(error)) throw new Error(error.message);
}

/** Where you were last reading, on any device; null before any, or before migration 062. */
export async function fetchReading(pin: string): Promise<Reading | null> {
  const { data, error } = await supabase.from("reading_now").select("path, page, kind, updated_at").eq("device_id", pin).maybeSingle();
  if (missingTable(error)) return null;
  if (error) throw new Error(error.message);
  return (data as Reading | null) ?? null;
}
