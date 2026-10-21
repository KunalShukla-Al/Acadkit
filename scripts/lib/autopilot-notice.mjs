/**
 * A notice, read by Autopilot (scripts/lib/autopilot.mjs): the model lists
 * the tests and deadlines on it, and the new ones are added to the app.
 * Each deadline keeps its source (the file), and one autopilot_actions row
 * holds them all, so the app can say what was added and undo it
 * (migration 053).
 */
import { randomUUID } from "node:crypto";
import { getDayInfo, semesterWindow } from "../../packages/core/src/calendar.ts";
import { diffDays } from "../../packages/core/src/dates.ts";
import { DEFAULT_DUE_TIME, suggestDueTime } from "../../packages/core/src/dueTime.ts";
import { subjectShort } from "../../packages/core/src/subjectShort.ts";
import { ask as askModel } from "./ollama.mjs";

/** How sure the model must be of a notice's dates before they become deadlines. */
export const SURE = 0.7;
/** A date further ahead than this is more likely misread than real. */
const AHEAD_DAYS = 200;

/** The courses, as the model is shown them: "- 21CSC202J: Operating Systems (OS)". */
export const courseList = (subjects) =>
  subjects.map((s) => `- ${s.code}: ${s.name}${s.short_name ? ` (${s.short_name})` : ""}`).join("\n");

export function noticeSchema(subjects) {
  return {
    type: "object",
    properties: {
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            type: { type: "string", enum: ["exam", "assignment", "lab", "other"] },
            subject: { type: ["string", "null"], enum: [...subjects.map((s) => s.code), null] },
            date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            time: { type: ["string", "null"], pattern: "^\\d{2}:\\d{2}$" },
            max_marks: { type: ["number", "null"] },
          },
          required: ["title", "type", "subject", "date", "time", "max_marks"],
          additionalProperties: false,
        },
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["events", "confidence"],
    additionalProperties: false,
  };
}

const longDay = (date) =>
  new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export function noticePrompt({ name, text, subjects, today }) {
  return [
    `This is a notice a university student in India saved ("${name}"). Today is ${longDay(today)}. Their courses:`,
    courseList(subjects),
    "",
    "List every test, exam, submission and deadline it announces for these courses, in JSON:",
    "- title: a few words, as the notice names it. On SRM's portal an exam of type T-EXT or P-EXT is the end semester exam: call it \"End semester exam\".",
    '- type: "exam" for a test, quiz or exam; "assignment" for something to submit; "lab" for a lab test or record; otherwise "other".',
    "- subject: its course code from the list, or null.",
    "- date: YYYY-MM-DD. Dates on these notices are day first (05/11 is 5 November), and one without a year is the next such date from today.",
    "- time: HH:MM in 24 hours when the notice gives one, else null.",
    "- max_marks: what it is out of when the notice says, else null.",
    "Leave out what is for other courses or already past. confidence: from 0 to 1, how sure you are of every date.",
    ...(text ? ["", `Text on its first pages: ${text}`] : []),
  ].join("\n");
}

const istDate = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/**
 * The deadlines a notice adds: one per event, from today on, and not on the
 * list already (a deadline for the same course on the same day). A test
 * without a time takes that day's class, as the app's deadline sheet
 * suggests (core/dueTime.ts).
 */
export function deadlinesFrom(events, { pin, subjects, deadlines, slots, settings, today, source, uuid = randomUUID }) {
  const window = semesterWindow(settings);
  const taken = new Set(deadlines.map((d) => `${d.subject_id}|${istDate(d.due_date)}`));
  const rows = [];
  for (const e of events) {
    if (e.date < today || diffDays(today, e.date) > AHEAD_DAYS) continue;
    const subject = subjects.find((s) => s.code === e.subject) ?? null;
    const key = `${subject?.id ?? null}|${e.date}`;
    if (taken.has(key)) continue;
    taken.add(key);
    const dayOrder = getDayInfo(e.date, settings?.declared_holidays ?? [], window).dayOrder;
    const time = e.time ?? suggestDueTime(e.type, subject?.id ?? null, dayOrder, slots)?.time ?? DEFAULT_DUE_TIME;
    rows.push({
      id: uuid(),
      device_id: pin,
      subject_id: subject?.id ?? null,
      title: e.title.trim(),
      type: e.type,
      due_date: new Date(`${e.date}T${time}:00+05:30`).toISOString(),
      status: "pending",
      priority: e.type === "exam" ? "high" : "medium",
      max_marks: e.max_marks,
      source,
    });
  }
  return rows.sort((a, b) => a.due_date.localeCompare(b.due_date));
}

/** "Added OS FT-II (Thu, 29 Oct) and DSA Lab record (Mon, 2 Nov)." */
export function saidFor(rows, subjects) {
  const names = rows.map((r) => {
    const s = subjects.find((x) => x.id === r.subject_id);
    const short = s ? subjectShort(s) : "";
    const title = short && !r.title.toUpperCase().includes(short.toUpperCase()) ? `${short} ${r.title}` : r.title;
    const day = new Date(r.due_date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
    return `${title} (${day})`;
  });
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  return `Added ${list}.`;
}

/**
 * Reads the notice's tests and deadlines and adds the new ones, with the
 * action row to undo them by. Returns what it did ("added", "unsure" of the
 * dates, or all "listed" already), with one line to say and how sure the
 * model was; null for a notice with nothing on it.
 */
export async function addFromNotice({ supabase, pin, source, page, subjects, today, ask = askModel }) {
  const notice = await ask({ prompt: noticePrompt({ name: source.split("/").pop(), text: page.text, subjects, today }), images: page.images, schema: noticeSchema(subjects) });
  const { confidence } = notice;
  if (confidence < SURE) return { decision: "unsure", confidence, said: `Not sure enough of the dates on ${source} (${Math.round(confidence * 100)}%); left for you.` };

  const mine = (table) => supabase.from(table).select("*").eq("device_id", pin);
  const [settings, slots, deadlines] = await Promise.all([mine("settings"), mine("timetable_slots"), mine("deadlines")]);
  for (const r of [settings, slots, deadlines]) if (r.error) throw new Error(`Couldn't read the deadlines: ${r.error.message}`);
  const rows = deadlinesFrom(notice.events, {
    pin,
    subjects,
    deadlines: deadlines.data.filter((d) => d.status === "pending"),
    slots: slots.data,
    settings: settings.data[0] ?? null,
    today,
    source,
  });
  if (!rows.length) return notice.events.length ? { decision: "listed", confidence, said: `Everything on ${source} is on your list already.` } : null;

  const said = saidFor(rows, subjects);
  // The action first, so no deadline is ever added without its Undo.
  const { data: action, error } = await supabase
    .from("autopilot_actions")
    .insert({ device_id: pin, source, said, confidence, deadline_ids: rows.map((r) => r.id) })
    .select("id")
    .single();
  if (error) throw new Error(`Couldn't record what Autopilot did: ${error.message}`);
  const added = await supabase.from("deadlines").insert(rows);
  if (added.error) {
    await supabase.from("autopilot_actions").delete().eq("id", action.id);
    throw new Error(`Couldn't add the deadlines: ${added.error.message}`);
  }
  return { decision: "added", confidence, said, deadlines: rows.length };
}
