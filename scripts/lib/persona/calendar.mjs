/**
 * PersonaOS's calendar feed (docs/persona.md): my deadlines as an .ics my
 * iPhone Calendar subscribes to. It holds AcadKit's deadlines, the ones I've
 * confirmed, and the deadline engine's suggestions I haven't, marked "?".
 *
 * The file goes to <pin>/calendar/<secret>.ics in the private study bucket.
 * The phone reads it through one signed link, made once and kept for years
 * (`npm run persona -- calendar`); a new secret in calendar.json retires it.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PERSONA_DIR } from "./store.mjs";

export const CALENDAR_STATE = path.join(PERSONA_DIR, "calendar.json");
const BUCKET = "study-files";
const LINK_YEARS = 5;
const BACK_DAYS = 30;

/** Text escaped for an iCalendar value. */
export const icsText = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** One content line folded at 75 octets, as RFC 5545 asks. */
export function fold(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts = [];
  let start = 0;
  let width = 75;
  while (start < bytes.length) {
    let end = Math.min(start + width, bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    width = 74;
  }
  return parts.join("\r\n ");
}

const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dayOf = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/**
 * The feed's events: confirmed deadlines, then suggestions that match none of
 * them by course and day. `subjects` maps a subject id to { code, short_name, name }.
 */
export function feedEvents({ deadlines, subjects, suggestions }) {
  const events = [];
  const confirmed = new Set();
  for (const d of deadlines) {
    const s = subjects.get(d.subject_id) ?? {};
    confirmed.add(`${s.code ?? ""}|${dayOf(d.due_date)}`);
    const name = [s.short_name || s.name, d.title].filter(Boolean).join(" ");
    events.push({
      uid: `deadline-${d.id}@acadkit`,
      start: d.due_date,
      summary: `${d.status === "done" ? "✓ " : ""}${name || "Deadline"}`,
      description: [d.type, d.source].filter(Boolean).join(" · "),
    });
  }
  for (const s of suggestions) {
    if (confirmed.has(`${s.subject_code}|${dayOf(s.due_date)}`)) continue;
    const short = [...subjects.values()].find((x) => x.code === s.subject_code)?.short_name ?? s.subject_code;
    events.push({
      uid: `suggested-${s.subject_code}-${s.label}-${dayOf(s.due_date)}@persona`.replace(/\s+/g, "_"),
      start: s.due_date,
      summary: `? ${short} ${s.label} (not confirmed)`,
      description: [s.source, s.evidence && `“${s.evidence}”`].filter(Boolean).join("\n"),
    });
  }
  return events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/** The .ics text: an hour per event, an alert the day before. */
export function buildIcs(events, now = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AcadKit//PersonaOS//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:AcadKit",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(e.start)}`,
      "DURATION:PT1H",
      `SUMMARY:${icsText(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsText(e.summary)}`,
      "TRIGGER:-P1D",
      "END:VALARM",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

async function readState(file) {
  return JSON.parse(await readFile(file, "utf8").catch(() => "null")) ?? {};
}

async function saveState(file, state) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(state, null, 1));
}

/** The bucket path, its secret made on first use. */
export async function feedPath(pin, file = CALENDAR_STATE) {
  const state = await readState(file);
  if (!state.secret) {
    state.secret = randomBytes(12).toString("hex");
    await saveState(file, state);
  }
  return `${pin}/calendar/${state.secret}.ics`;
}

/** Build the feed from the database and the engine's suggestions, and upload it. Returns the job's note. */
export async function publishCalendar({ supabase, pin, suggestionsFile, now = new Date(), file = CALENDAR_STATE }) {
  const since = new Date(now.getTime() - BACK_DAYS * 86_400_000).toISOString();
  const [{ data: deadlines, error: e1 }, { data: subs, error: e2 }] = await Promise.all([
    supabase.from("deadlines").select("id,subject_id,title,type,due_date,status,source").eq("device_id", pin).gte("due_date", since),
    supabase.from("subjects").select("id,code,short_name,name").eq("device_id", pin),
  ]);
  if (e1 || e2) throw new Error((e1 ?? e2).message);
  const raw = suggestionsFile ? await readFile(suggestionsFile, "utf8").catch(() => "{}") : "{}";
  const suggestions = (JSON.parse(raw).deadlines ?? []).filter((s) => Date.parse(s.due_date) >= now.getTime());
  const events = feedEvents({ deadlines: deadlines ?? [], subjects: new Map((subs ?? []).map((s) => [s.id, s])), suggestions });
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(await feedPath(pin, file), buildIcs(events, now), { contentType: "text/calendar; charset=utf-8", upsert: true, cacheControl: "300" });
  if (error) throw new Error(error.message);
  const unconfirmed = events.filter((e) => e.uid.endsWith("@persona")).length;
  return `${events.length} event${events.length === 1 ? "" : "s"} (${unconfirmed} not confirmed)`;
}

/** The webcal:// link the phone subscribes to, signed once for years and kept. */
export async function calendarLink({ supabase, pin, file = CALENDAR_STATE }) {
  const state = await readState(file);
  const where = await feedPath(pin, file);
  if (state.link && state.linkFor === where) return state.link;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(where, LINK_YEARS * 365 * 86_400);
  if (error) throw new Error(error.message);
  const link = data.signedUrl.replace(/^https:/, "webcal:");
  await saveState(file, { ...(await readState(file)), link, linkFor: where });
  return link;
}
