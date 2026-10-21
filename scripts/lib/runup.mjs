/**
 * The run-up: a day-by-day plan from now to the last end-sem, read from
 * the study folder's _src/acadkit_runup.json and sent on as
 * <pin>/runup.json for the Run-up page.
 *
 * {
 *   version: 1, title, start: "YYYY-MM-DD", end: "YYYY-MM-DD",
 *   events: [{ id, subject_code, title, kind, date, when, target: { score, max, note },
 *              weight, format, units, portion, scoring, prepare,
 *              analysis: { source, items: [{ topic, seen, note }] },
 *              pyqs: [{ source, file, page, number, marks, unit, topic, year, kind, text }],
 *              files: [{ path, why }] }],
 *   days: [{ date, focus, tasks: [{ id, text, subject_code, event, minutes, files }] }]
 * }
 *
 * Like the weekly cards (weekly.mjs), one bad entry is dropped with a
 * warning and never hides the rest. Task ids are what a tick is stored
 * under (migration 043), so a repeated id is dropped rather than letting
 * one tick count for two tasks.
 *
 * A link may name the study folder itself ("SRM_Sem4/…"): the plan's
 * generators file the next semester's links that way, and they keep
 * working once that folder is the study folder (scripts/lib/semester.mjs).
 */
import { contentPart } from "./parts.mjs";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9#:._-]{0,79}$/;
const KINDS = new Set(["test", "lab", "quiz", "review", "presentation", "worksheet", "endsem", "other"]);

const isDay = (s) => typeof s === "string" && DAY.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const text = (s) => (typeof s === "string" ? s.trim() : "");
const texts = (a) => (Array.isArray(a) ? a.map(text).filter(Boolean) : []);
const num = (n) => (typeof n === "number" && Number.isFinite(n) ? n : null);

/** A unit list: whole numbers 1-10, each once, in order. */
function units(a) {
  if (!Array.isArray(a)) return [];
  return [...new Set(a.filter((n) => Number.isInteger(n) && n >= 1 && n <= 10))].sort((x, y) => x - y);
}

function target(t, what, warnings) {
  if (t == null) return null;
  const score = num(t.score);
  const max = num(t.max);
  if (score === null || max === null || max <= 0 || score < 0 || score > max) {
    warnings.push(`${what}: target needs a score between 0 and max, shown without it`);
    return null;
  }
  return { score, max, note: text(t.note) || null };
}

/** `known` as a lookup that also takes a path through the folder's own name; null when the sync doesn't have it. */
function linker(known, root) {
  const own = root ? `${root}/` : null;
  return (p) => (known.has(p) ? p : own && p.startsWith(own) && known.has(p.slice(own.length)) ? p.slice(own.length) : null);
}

function files(list, find, what, warnings) {
  const out = [];
  for (const f of Array.isArray(list) ? list : []) {
    const raw = text(typeof f === "string" ? f : f?.path);
    if (!raw) continue;
    const p = find(raw);
    if (!p) {
      warnings.push(`${what}: no such file ${raw}`);
      continue;
    }
    out.push(typeof f === "string" ? { path: p, why: null } : { path: p, why: text(f.why) || null });
  }
  return out;
}

function pyqs(list, find, what, warnings) {
  const out = [];
  let missing = 0;
  for (const q of Array.isArray(list) ? list : []) {
    const body = text(q?.text);
    if (!body) continue;
    const raw = text(q.file);
    const file = raw ? find(raw) : null;
    if (raw && !file) missing++;
    const page = Number.isInteger(q.page) && q.page > 0 ? q.page : null;
    out.push({
      source: text(q.source) || null,
      file,
      page: file ? page : null,
      number: q.number == null ? null : text(String(q.number)) || null,
      marks: num(q.marks),
      unit: Number.isInteger(q.unit) ? q.unit : null,
      topic: text(q.topic) || null,
      year: Number.isInteger(q.year) ? q.year : null,
      kind: text(q.kind) || null,
      text: body,
    });
  }
  if (missing) warnings.push(`${what}: ${missing} past-paper question(s) point at a file the sync doesn't know, shown without the link`);
  return out;
}

function analysis(a) {
  if (!a || !Array.isArray(a.items)) return null;
  const items = a.items
    .map((i) => ({ topic: text(i?.topic), seen: text(i?.seen) || null, note: text(i?.note) || null }))
    .filter((i) => i.topic);
  return items.length ? { source: text(a.source) || null, items } : null;
}

/** `known`: the manifest's paths; `root`: the study folder's name. */
export function checkRunup(data, known, root = null) {
  const find = linker(known, root);
  const warnings = [];
  if (data?.version !== 1) warnings.push(`version should be 1, read as 1`);
  if (!isDay(data?.start) || !isDay(data?.end) || data.start > data.end) {
    return { body: null, warnings: [...warnings, `needs "start" and "end" as YYYY-MM-DD, start first`] };
  }
  const { start, end } = data;

  const events = [];
  const eventIds = new Set();
  for (const [i, e] of (data.events ?? []).entries()) {
    const id = text(e?.id);
    const what = `event ${id || i + 1}`;
    if (!ID.test(id) || !text(e.title)) {
      warnings.push(`${what}: needs an id (letters, digits, - _ . : #) and a title`);
      continue;
    }
    if (eventIds.has(id)) {
      warnings.push(`${what}: id used twice, the second one dropped`);
      continue;
    }
    if (e.date != null && !isDay(e.date)) {
      warnings.push(`${what}: date must be YYYY-MM-DD or null, shown as undated`);
    }
    eventIds.add(id);
    events.push({
      id,
      subject_code: text(e.subject_code) || null,
      title: text(e.title),
      kind: KINDS.has(e.kind) ? e.kind : "other",
      date: isDay(e.date) ? e.date : null,
      when: text(e.when) || null,
      target: target(e.target, what, warnings),
      weight: text(e.weight) || null,
      format: text(e.format) || null,
      units: units(e.units),
      portion: texts(e.portion),
      scoring: texts(e.scoring),
      prepare: texts(e.prepare),
      analysis: analysis(e.analysis),
      pyqs: pyqs(e.pyqs, find, what, warnings),
      files: files(e.files, find, what, warnings),
    });
  }
  events.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.title.localeCompare(b.title));

  const days = [];
  const dates = new Set();
  const taskIds = new Set();
  for (const [i, d] of (data.days ?? []).entries()) {
    if (!isDay(d?.date) || d.date < start || d.date > end) {
      warnings.push(`day ${i + 1}: date must be YYYY-MM-DD between ${start} and ${end}`);
      continue;
    }
    if (dates.has(d.date)) {
      warnings.push(`day ${d.date}: listed twice, the second one dropped`);
      continue;
    }
    dates.add(d.date);
    const tasks = [];
    for (const [j, t] of (d.tasks ?? []).entries()) {
      const id = text(t?.id);
      const what = `task ${id || `${d.date} #${j + 1}`}`;
      if (!ID.test(id) || !text(t.text)) {
        warnings.push(`${what}: needs an id and text`);
        continue;
      }
      if (taskIds.has(id)) {
        warnings.push(`${what}: id used twice, the second one dropped`);
        continue;
      }
      taskIds.add(id);
      let event = text(t.event) || null;
      if (event && !eventIds.has(event)) {
        warnings.push(`${what}: no event ${event}, shown without it`);
        event = null;
      }
      const minutes = Number.isInteger(t.minutes) && t.minutes > 0 && t.minutes <= 720 ? t.minutes : null;
      tasks.push({
        id,
        text: text(t.text),
        subject_code: text(t.subject_code) || null,
        event,
        minutes,
        files: files(t.files, find, what, warnings).map((f) => f.path),
      });
    }
    days.push({ date: d.date, focus: text(d.focus) || null, tasks });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));

  return {
    body: { version: 1, generatedAt: Date.now(), title: text(data.title) || null, start, end, events, days },
    warnings,
  };
}

/**
 * The checked plan as the files the app loads: <pin>/runup.json, an index
 * of the window, the events and the month files, then under <pin>/runup/
 * one file of days per month and each event's past-paper questions, which
 * only its page loads. The questions are most of the plan (485 of 707 KB on
 * Sem 3). Each part is named by its content (scripts/lib/parts.mjs), so the
 * app keeps the parts it has and an edit to today's tasks sends one month and
 * the index again.
 */
export function splitRunup(body) {
  const parts = [];
  const part = (stem, data) => {
    const p = contentPart("runup", stem, data);
    parts.push(p);
    return p.name;
  };
  const byMonth = new Map();
  for (const d of body.days) {
    const m = d.date.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(d);
  }
  const months = [...byMonth].map(([m, days]) => part(m, { days }));
  const events = body.events.map(({ pyqs, ...e }) => ({ ...e, pyqCount: pyqs.length, pyqsFile: pyqs.length ? part(`pyqs-${e.id}`, { pyqs }) : null }));
  const { days: _days, events: _events, ...head } = body;
  return { index: { ...head, version: 2, events, months }, parts };
}

