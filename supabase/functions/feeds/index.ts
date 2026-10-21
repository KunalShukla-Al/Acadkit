// Supabase Edge Function: feeds (handle.ts). It imports packages/core, outside supabase/, so it
// deploys with --use-api; it checks its own token, so with --no-verify-jwt:
//   supabase functions deploy feeds --use-api --no-verify-jwt --project-ref <ref>
import { createClient } from "npm:@supabase/supabase-js@2";
import type { AttendanceRecord, Deadline, Mark, PortalSnapshot, Settings, Subject, TimetableSlot } from "../../../packages/core/src/types.ts";
import type { AbsentRow } from "../../../packages/core/src/absent.ts";
import { handle, type Account, type Shared } from "./handle.ts";

/** Requests per token per minute: Siri, the share sheet, the calendar's hourly fetch and the morning Shortcuts fit well inside it. */
const LIMIT_PER_MINUTE = 30;

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

/** Look up, check and count the token in one call (migration 052). */
async function use(token: string): Promise<{ pin: string; allowed: boolean } | null> {
  const { data, error } = await sb.rpc("feed_use", { p_token: token, p_limit: LIMIT_PER_MINUTE });
  if (error) throw new Error(`feed_use: ${error.message}`);
  const row = (data as { device_id: string; allowed: boolean }[] | null)?.[0];
  return row ? { pin: row.device_id, allowed: row.allowed } : null;
}

type Result<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function rows<T>(table: string, query: Result<T>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

async function load(pin: string): Promise<Account> {
  const mine = (table: string) => sb.from(table).select("*").eq("device_id", pin);
  const [settings, subjects, slots, attendance, snapshots, deadlines, marks] = await Promise.all([
    rows<Settings>("settings", mine("settings")),
    rows<Subject>("subjects", mine("subjects")),
    rows<TimetableSlot>("timetable_slots", mine("timetable_slots")),
    rows<AttendanceRecord>("attendance", mine("attendance")),
    rows<PortalSnapshot>("portal_snapshots", mine("portal_snapshots")),
    rows<Deadline>("deadlines", mine("deadlines").eq("status", "pending")),
    rows<Mark>("marks", mine("marks")),
  ]);
  return { settings: settings[0] ?? null, subjects, slots, attendance, snapshots, deadlines, marks };
}

/** The bytes into the inbox, then the row the Mac acts on; no row, no stray bytes. */
async function share(pin: string, f: Shared): Promise<void> {
  const bucket = sb.storage.from("study-files");
  const { error: upErr } = await bucket.upload(f.key, f.bytes, { contentType: f.type, upsert: false });
  if (upErr) throw new Error(`upload: ${upErr.message}`);
  const { error } = await sb.from("study_uploads").insert({ device_id: pin, path: f.path, key: f.key, size: f.bytes.length });
  if (error) {
    await bucket.remove([f.key]);
    throw new Error(`study_uploads: ${error.message}`);
  }
}

/** The classes marked absent, then the record the app's Undo reads; the record is what makes it undoable, so it goes second. */
async function markAbsent(pin: string, said: string, rows: AbsentRow[]): Promise<void> {
  const { error } = await sb.from("attendance").upsert(
    rows.map((r) => ({ device_id: pin, subject_id: r.subject_id, date: r.date, start_time: r.start_time, end_time: r.end_time, status: "absent", auto_marked: false })),
    { onConflict: "device_id,subject_id,date,start_time" }
  );
  if (error) throw new Error(`attendance: ${error.message}`);
  const { error: e2 } = await sb.from("siri_marks").insert({ device_id: pin, said, rows });
  if (e2) throw new Error(`siri_marks: ${e2.message}`);
}

Deno.serve((req) =>
  handle(req, { use, load, share, markAbsent, now: () => new Date() }).catch((err) => {
    console.error(err);
    return new Response(JSON.stringify({ error: "something went wrong" }), { status: 500, headers: { "Content-Type": "application/json" } });
  })
);
