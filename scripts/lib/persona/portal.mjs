/**
 * The Student Portal's attendance into AcadKit (docs/persona.md): what persona/portal.py read in my
 * own logged-in Chrome tab, saved the way a pasted portal page is (src/api/portal.ts). Every read
 * refreshes portal_snapshots, so the app and send-reminders' attendance pushes work from today's
 * numbers; the history (migration 066's 'mac' source) gains a row only when a number changes.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PERSONA_DIR } from "./store.mjs";

export const PORTAL_DIR = path.join(PERSONA_DIR, "portal");

const readJson = async (file, fallback) => JSON.parse(await readFile(file, "utf8").catch(() => "null")) ?? fallback;
const istDay = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const clock = (d) => new Date(d).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });

/** The read's own outcome (scripts/mac/portal-read.sh): its note, or an error when it failed. */
export async function portalStatus(dir = PORTAL_DIR) {
  const s = await readJson(path.join(dir, "status.json"), null);
  if (!s) return "the portals haven't been read yet";
  if (!s.ok) throw new Error(s.note);
  return s.note;
}

/**
 * When the Student Portal session just dropped, upload one alert send-reminders pushes to my phone
 * right away (keyed to the logout minute, so it's sent once). Returns a note when it sent one.
 */
export async function alertOnLogout({ supabase, pin, dir = PORTAL_DIR }) {
  const portal = (await readJson(path.join(dir, "state.json"), {})).portal ?? {};
  if (!portal.logout_at) return null;
  const sent = await readJson(path.join(dir, "alerted.json"), {});
  if (sent.logout_at === portal.logout_at) return null;
  const body = `Logged out at ${clock(portal.logout_at)}. Log in on the Mac and leave the tab open so attendance stays fresh.`;
  const { error } = await supabase.storage
    .from("study-files")
    .upload(`${pin}/persona/alert.json`, JSON.stringify({ ref: `portal-out|${portal.logout_at.slice(0, 16)}`, title: "Student Portal", body, url: "/attendance" }), {
      contentType: "application/json",
      upsert: true,
      cacheControl: "0",
    });
  if (error) throw new Error(error.message);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "alerted.json"), JSON.stringify({ logout_at: portal.logout_at }));
  return `logout alert queued for ${clock(portal.logout_at)}`;
}

/** Save the latest attendance read to AcadKit. Returns the job's note. */
export async function uploadAttendance({ supabase, pin, dir = PORTAL_DIR }) {
  const state = await readJson(path.join(dir, "state.json"), {});
  const portal = state.portal ?? {};
  if (!portal.attendance?.length) return portal.login ? "waiting for you to log in to the Student Portal" : "no attendance read yet";
  const sent = await readJson(path.join(dir, "uploaded.json"), {});
  if (sent.read_at === portal.read_at) {
    return `${portal.attendance.length} subjects as of ${clock(portal.read_at)}${portal.login ? "; log in again for fresh numbers" : ""}`;
  }
  const rows = portal.attendance.map((a) => ({
    device_id: pin,
    subject_code: a.code,
    conducted: a.conducted,
    absent: a.absent,
    percentage: a.percentage,
    as_of: istDay(portal.read_at),
    synced_at: portal.read_at,
  }));
  const { error } = await supabase.from("portal_snapshots").upsert(rows, { onConflict: "device_id,subject_code" });
  if (error) throw new Error(error.message);
  const numbers = JSON.stringify(portal.attendance.map((a) => [a.code, a.conducted, a.absent]));
  if (numbers !== sent.numbers) {
    const { error: e2 } = await supabase.from("portal_snapshot_history").insert(rows.map((r) => ({ ...r, source: "mac" })));
    if (e2) throw new Error(/check constraint/i.test(e2.message) ? "history needs migration 066: approve the Deploy run" : e2.message);
  }
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "uploaded.json"), JSON.stringify({ read_at: portal.read_at, numbers }));
  return `${rows.length} subjects to AcadKit${numbers !== sent.numbers ? ", numbers changed" : ""}`;
}
