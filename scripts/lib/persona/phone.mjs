/**
 * What PersonaOS puts on my iPhone (docs/persona.md), built from AcadKit's
 * deadlines and what the engines left in the persona folder:
 *
 *   <pin>/calendar/<secret>.ics         the calendar feed (calendar.mjs)
 *   <pin>/calendar/<secret>-today.json  the home-screen widget's data (scripts/mac/scriptable/)
 *   <pin>/persona/brief.json            the morning brief, pushed by send-reminders between 07:00 and 11:00
 *
 * The brief says only what AcadKit's own reminders don't: a portal login it
 * needs, dates found in my groups that I haven't confirmed, new marks, what
 * the engine couldn't settle, today's learning task, mail that matters,
 * GitHub, and on Sundays what I used of PersonaOS.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildIcs, feedEvents, feedPath } from "./calendar.mjs";
import { PERSONA_DIR } from "./store.mjs";
import { usage, usageBrief } from "./usage.mjs";

const BUCKET = "study-files";
const BACK_DAYS = 30;
const SOON_DAYS = 3;

const readJson = async (file, fallback) => JSON.parse(await readFile(file, "utf8").catch(() => "null")) ?? fallback;
const istDay = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const short = (iso) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });

/** AcadKit's deadlines and subjects, and the engine's upcoming suggestions. */
export async function gather({ supabase, pin, suggestionsFile, now }) {
  const since = new Date(now.getTime() - BACK_DAYS * 86_400_000).toISOString();
  const [{ data: deadlines, error: e1 }, { data: subs, error: e2 }] = await Promise.all([
    supabase.from("deadlines").select("id,subject_id,title,type,due_date,status,source").eq("device_id", pin).gte("due_date", since),
    supabase.from("subjects").select("id,code,short_name,name").eq("device_id", pin),
  ]);
  if (e1 || e2) throw new Error((e1 ?? e2).message);
  const raw = suggestionsFile ? await readJson(suggestionsFile, {}) : {};
  const suggestions = (raw.deadlines ?? []).filter((s) => Date.parse(s.due_date) >= now.getTime());
  return { deadlines: deadlines ?? [], subjects: new Map((subs ?? []).map((s) => [s.id, s])), suggestions };
}

/** Today's learning tasks from the Run-up plan (`learn:` ids in <STUDY_DIR>/_src/acadkit_runup.json). */
export function learningToday(runup, now) {
  const today = istDay(now);
  const day = (runup?.days ?? []).find((d) => d.date === today);
  return (day?.tasks ?? []).filter((t) => String(t.id).startsWith("learn:")).map((t) => `${t.text}${t.minutes ? ` (${t.minutes} min)` : ""}`);
}

/** The brief's lines, at most five, from the gathered data and the engines' files. */
export function briefLines({ events, questions, signals = [], github, learning = [], weekly = null, now }) {
  const lines = [];
  const login = signals.find((s) => s.kind === "login");
  if (login) lines.push(login.title ?? "Log in to the Student Portal in Chrome on the Mac and leave its tab open, so attendance stays fresh.");
  const fresh = events.filter((e) => e.uid.endsWith("@persona"));
  if (fresh.length) {
    const names = fresh.slice(0, 3).map((e) => `${e.summary.replace(/^\? /, "").replace(/ \(not confirmed\)$/, "")} ${short(e.start)}`);
    lines.push(`New from your groups: ${names.join(", ")}${fresh.length > 3 ? ` and ${fresh.length - 3} more` : ""}. Add them in AcadKit.`);
  }
  const marks = signals.filter((s) => s.kind === "marks");
  if (marks.length) lines.push(`New marks: ${marks.slice(0, 3).map((m) => m.title).join("; ")}.`);
  if (questions.length) lines.push(`Unsure: ${questions[0].question}${questions.length > 1 ? ` (+${questions.length - 1} more)` : ""}`);
  if (learning.length) lines.push(`Learning today: ${learning[0]}${learning.length > 1 ? ` and ${learning.length - 1} more` : ""}.`);
  const kinds = { mercor: "Mercor", job: "job alert", course: "course mail" };
  const worth = signals.filter((m) => m.kind in kinds);
  if (worth.length) {
    const mercor = worth.filter((m) => m.kind === "mercor");
    const others = worth.length - mercor.length;
    const parts = mercor.slice(0, 2).map((m) => `Mercor: “${m.title}”`);
    if (others) parts.push(`${others} job or course mail${others === 1 ? "" : "s"}`);
    lines.push(`Mail: ${parts.join("; ")}.`);
  }
  if (github) {
    const waiting = github.waiting ?? [];
    const failing = waiting.filter((w) => w.ci === "failing");
    const yesterday = istDay(now.getTime() - 86_400_000);
    const bits = [];
    if (waiting.length) bits.push(`${waiting.length} PR${waiting.length === 1 ? "" : "s"} wait for your merge (${waiting.slice(0, 3).map((w) => `${w.repo.split("/")[1]} #${w.number}`).join(", ")})`);
    if (failing.length) bits.push(`checks fail on ${failing.map((w) => `#${w.number}`).join(", ")}`);
    if (!(github.pushed_days ?? []).includes(yesterday)) bits.push("no push yesterday");
    if (bits.length) lines.push(`GitHub: ${bits.join("; ")}.`);
  }
  if (weekly) lines.push(weekly);
  return lines.slice(0, 5);
}

/** The widget's data: what's due in the next three days, what's new, and the brief. */
export function todayData({ events, lines, now }) {
  const until = now.getTime() + SOON_DAYS * 86_400_000;
  const due = events
    .filter((e) => Date.parse(e.start) >= now.getTime() && Date.parse(e.start) <= until && !e.summary.startsWith("✓"))
    .map((e) => ({ when: e.start, title: e.summary }));
  return { at: now.toISOString(), due, unconfirmed: events.filter((e) => e.uid.endsWith("@persona")).length, brief: lines };
}

async function engineFiles(dir, runupFile, now) {
  return {
    questions: await readJson(path.join(dir, "questions.json"), []),
    signals: await readJson(path.join(dir, "signals.json"), []),
    github: await readJson(path.join(dir, "github.json"), null),
    learning: runupFile ? learningToday(await readJson(runupFile, null), now) : [],
  };
}

/** The `phone` job: the calendar and the widget's data. */
export async function publishPhone({ supabase, pin, suggestionsFile, runupFile, now = new Date(), dir = PERSONA_DIR }) {
  const events = feedEvents(await gather({ supabase, pin, suggestionsFile, now }));
  const lines = briefLines({ events, ...(await engineFiles(dir, runupFile, now)), now });
  const where = await feedPath(pin, path.join(dir, "calendar.json"));
  const bucket = supabase.storage.from(BUCKET);
  const up = async (key, body, type) => {
    const { error } = await bucket.upload(key, body, { contentType: type, upsert: true, cacheControl: "300" });
    if (error) throw new Error(error.message);
  };
  await up(where, buildIcs(events, now), "text/calendar; charset=utf-8");
  await up(where.replace(/\.ics$/, "-today.json"), JSON.stringify(todayData({ events, lines, now })), "application/json");
  const unconfirmed = events.filter((e) => e.uid.endsWith("@persona")).length;
  return `${events.length} event${events.length === 1 ? "" : "s"} (${unconfirmed} not confirmed)`;
}

/** The `brief` job: the morning's lines for send-reminders to push. */
export async function publishBrief({ supabase, pin, suggestionsFile, runupFile, now = new Date(), dir = PERSONA_DIR }) {
  const events = feedEvents(await gather({ supabase, pin, suggestionsFile, now }));
  const sunday = new Date(now).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", weekday: "long" }) === "Sunday";
  const weekly = sunday ? usageBrief(await usage({ supabase, pin, now })) : null;
  const lines = briefLines({ events, ...(await engineFiles(dir, runupFile, now)), weekly, now });
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`${pin}/persona/brief.json`, JSON.stringify({ date: istDay(now), lines }), { contentType: "application/json", upsert: true, cacheControl: "0" });
  if (error) throw new Error(error.message);
  return lines.length ? `${lines.length} line${lines.length === 1 ? "" : "s"}` : "nothing to say";
}
