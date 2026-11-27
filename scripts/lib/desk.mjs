/**
 * The Desk's data (docs/desk.md): each study folder's _src/acadkit_desk.json,
 * written by the Mac's export_desk.py, checked here and sent on as
 * <pin>/desk.json plus one content-named part per course (desk/<key>-<hash>.json),
 * so the phone loads one course at a time.
 *
 * {
 *   version: 1, semester, built, windows: [{ key, label, start, end }],
 *   courses: [{ key, code, name, folder, elective, credits, showUntil,
 *               reports: { predict, repeats, masterList },
 *               floor, endsems, askedBefore, backtest,
 *               tests: [{ id, name, when, units, note, papers, mcqOnly, rows, steps, start, end, date, weight, provisional }],
 *               lockin: [{ slot, unit, chain: [{ names, count }] }],
 *               units: [{ n, title, topics: [{ n, title, videos }], pyq, questions, ctQuestions, notes }],
 *               notes, papers,
 *               items: [{ key, unit, topic, topicName, kind, paper, slot, part, marks, mcq, text, options,
 *                         answer, note, file, page, date, repeats, solution: { file, page } }] }]
 * }
 *
 * An item's key is what its progress is stored under (migration 065), so a
 * repeated key is dropped. A file the folder doesn't have is cleared with one
 * warning per course, never hiding the item. A file that isn't a desk at all
 * throws: the sync then keeps the last good one in the bucket.
 */
import { contentPart } from "./parts.mjs";
import { follower } from "./moved.mjs";

const COURSE = /^[A-Z][A-Z0-9]{0,7}$/;
const ITEM = /^[A-Z][A-Z0-9]{0,7}\/[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = new Set(["ct", "end", "sister", "old"]);
const PARTS = new Set(["A", "B", "C", "D"]);

const text = (s) => (typeof s === "string" ? s.trim() : "");
const num = (n) => (typeof n === "number" && Number.isFinite(n) ? n : null);
const day = (s) => (typeof s === "string" && DAY.test(s) ? s : null);
const list = (a) => (Array.isArray(a) ? a : []);

/**
 * `{ body, warnings, follows }` for one folder's desk. `prefix` is the folder's
 * name when it is mirrored as one more top folder ("SRM_Sem4"), so its paths
 * become the manifest's.
 */
export function checkDesk(data, known, prefix = "", moved) {
  if (!data || typeof data !== "object" || data.version !== 1 || !Array.isArray(data.courses)) {
    throw new Error('not a desk: needs version 1 and a "courses" list');
  }
  const { resolve, follows } = follower(moved);
  const warnings = [];
  const find = (raw) => {
    const p = text(raw);
    if (!p) return null;
    const full = prefix ? `${prefix}/${p}` : p;
    return known.has(full) ? full : known.has(p) ? p : resolve(full) ?? resolve(p);
  };
  const courses = [];
  const seen = new Set();
  for (const [i, c] of data.courses.entries()) {
    const key = text(c?.key);
    if (!COURSE.test(key) || !text(c.name)) {
      warnings.push(`course ${key || i + 1}: needs a key (A–Z, digits) and a name, dropped`);
      continue;
    }
    if (seen.has(key)) {
      warnings.push(`course ${key}: listed twice, the second dropped`);
      continue;
    }
    seen.add(key);
    let missing = 0;
    const file = (raw) => {
      if (raw == null || raw === "") return null;
      const p = find(raw);
      if (!p) missing++;
      return p;
    };
    const keys = new Set();
    const items = [];
    for (const it of list(c.items)) {
      const k = text(it?.key);
      if (!ITEM.test(k) || !k.startsWith(`${key}/`) || !text(it.text) || !PARTS.has(it.part)) {
        warnings.push(`${key}: item ${k || "?"} needs a key under ${key}/, a part and a text, dropped`);
        continue;
      }
      if (keys.has(k)) {
        warnings.push(`${key}: item ${k} listed twice, the second dropped`);
        continue;
      }
      keys.add(k);
      const options = list(it.options).map(text).filter(Boolean).slice(0, 6);
      const answer = typeof it.answer === "string" && /^[A-F]$/.test(it.answer) && "ABCDEF".indexOf(it.answer) < options.length ? it.answer : null;
      const sol = it.solution && typeof it.solution === "object" ? { file: file(it.solution.file), page: num(it.solution.page) } : null;
      items.push({
        key: k,
        unit: num(it.unit),
        topic: text(it.topic) || null,
        topicName: text(it.topicName) || null,
        kind: KINDS.has(it.kind) ? it.kind : "end",
        paper: text(it.paper),
        slot: text(it.slot),
        part: it.part,
        marks: num(it.marks),
        mcq: it.mcq === true,
        text: text(it.text),
        options,
        answer,
        note: text(it.note) || null,
        file: file(it.file),
        page: num(it.page),
        date: day(it.date),
        repeats: num(it.repeats) ?? 1,
        solution: sol?.file ? sol : null,
      });
    }
    const docs = (a) => list(a).flatMap((d) => {
      const p = file(d?.path);
      return p ? [{ path: p, name: text(d.name) || p.split("/").pop(), ...(d.kind ? { kind: text(d.kind) } : {}), ...(d.when ? { when: text(d.when) } : {}) }] : [];
    });
    const reports = Object.fromEntries(Object.entries(c.reports ?? {}).flatMap(([k, v]) => (file(v) ? [[k, file(v)]] : [])));
    if (missing) warnings.push(`${key}: ${missing} file link(s) not in the study folder, shown without a link`);
    courses.push({
      key,
      code: text(c.code) || null,
      name: text(c.name),
      folder: text(c.folder) || null,
      semester: text(data.semester) || null,
      elective: text(c.elective) || null,
      credits: num(c.credits),
      showUntil: day(c.showUntil),
      reports,
      floor: num(c.floor),
      endsems: num(c.endsems),
      askedBefore: num(c.askedBefore),
      backtest: c.backtest && typeof c.backtest === "object" ? c.backtest : null,
      tests: list(c.tests).filter((t) => text(t?.name)).map((t) => ({
        id: text(t.id) || text(t.name),
        name: text(t.name),
        when: text(t.when) || null,
        units: list(t.units).filter((u) => Number.isInteger(u)),
        note: text(t.note) || null,
        papers: num(t.papers),
        mcqOnly: t.mcqOnly === true,
        rows: list(t.rows),
        steps: list(t.steps),
        start: day(t.start),
        end: day(t.end),
        date: day(t.date),
        weight: num(t.weight),
        provisional: t.provisional !== false,
      })),
      lockin: list(c.lockin),
      units: list(c.units).filter((u) => Number.isInteger(u?.n)).map((u) => ({
        n: u.n,
        title: text(u.title) || null,
        topics: list(u.topics).map((t) => ({
          n: num(t?.n),
          title: text(t?.title),
          videos: list(t?.videos).filter((v) => /^[A-Za-z0-9_-]{6,20}$/.test(v?.id ?? "")).map((v) => ({
            id: v.id, title: text(v.title) || null, teacher: text(v.teacher) || null, secs: num(v.secs), layer: text(v.layer) || null,
          })),
        })),
        pyq: list(u.pyq),
        questions: num(u.questions) ?? 0,
        ctQuestions: num(u.ctQuestions) ?? 0,
        notes: docs(u.notes),
      })),
      notes: docs(c.notes),
      papers: docs(c.papers),
      items,
    });
  }
  const windows = list(data.windows).filter((w) => text(w?.label) && day(w?.start)).map((w) => ({
    key: text(w.key) || text(w.label), label: text(w.label), start: w.start, end: day(w.end) ?? w.start, semester: text(data.semester) || null,
  }));
  return { body: { version: 1, built: day(data.built), windows, courses }, warnings, follows };
}

/** Several folders' desks as one: the current semester's courses, then the next one's. */
export function mergeDesks(bodies) {
  const courses = [];
  const keys = new Set();
  for (const b of bodies) for (const c of b.courses) if (!keys.has(c.key)) (keys.add(c.key), courses.push(c));
  return {
    version: 1,
    built: bodies.map((b) => b.built).filter(Boolean).sort().pop() ?? null,
    windows: bodies.flatMap((b) => b.windows),
    courses,
  };
}

/** `{ index, parts }`: the index lists each course with its counts and its part. */
export function splitDesk(body) {
  const parts = [];
  const courses = body.courses.map((c) => {
    const p = contentPart("desk", c.key, c);
    parts.push(p);
    return {
      key: c.key,
      code: c.code,
      name: c.name,
      semester: c.semester,
      showUntil: c.showUntil,
      items: c.items.length,
      keyed: c.items.filter((i) => i.answer).length,
      solved: c.items.filter((i) => i.solution).length,
      tests: c.tests.map(({ id, name, units, start, end, date, weight, provisional }) => ({ id, name, units, start, end, date, weight, provisional })),
      file: p.name,
    };
  });
  return { index: { version: 1, built: body.built, windows: body.windows, courses }, parts };
}
