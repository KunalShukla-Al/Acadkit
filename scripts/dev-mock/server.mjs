/** Offline preview backend. */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { subjectIndex, tagFile } from "../lib/tags.mjs";
import { RENDITION } from "../lib/renditions.mjs";
import { checkNotices, checkProjects } from "../lib/weekly.mjs";
import { checkRunup, splitRunup } from "../lib/runup.mjs";
import { checkCards } from "../lib/cards.mjs";
import { STORAGE_LIMIT, UPLOAD_CAP } from "../lib/storage.mjs";
import { handle as feedsHandle } from "../../supabase/functions/feeds/handle.ts";

const PORT = 54321;
const PIN = "1234";
const SEM_START = "2026-07-21";
const SEM_END = "2026-11-18";

const uid = (p, n) => `${p}-${String(n).padStart(4, "0")}`;

// The day the seeded history counts back from: today, or MOCK_TODAY if set. The e2e specs
// freeze the browser's clock on one day (TODAY in e2e/fixtures.ts) and set MOCK_TODAY to the
// same day; counted back from the real date, hand-marked history could land on that frozen day
// and show up in its sheet as extra classes.
const SEED_DAY = process.env.MOCK_TODAY ?? new Date().toLocaleDateString("en-CA");
const daysBack = (n) => {
  const d = new Date(`${SEED_DAY}T12:00:00`);
  d.setDate(d.getDate() - n);
  return d;
};

const SUBJECTS = [
  ["21CSC201J", "Data Structures & Algorithms", 4, "theory", "#7c6af7"],
  ["21CSC202J", "Operating Systems", 4, "theory", "#f97316"],
  ["21DCS201P", "Design Thinking & Methodology", 3, "theory", "#22d3ee"],
  ["21MAB201T", "Transforms & Boundary Value Problems", 4, "theory", "#4ade80"],
  ["21CSS202T", "Fundamentals of Data Science", 5, "theory", "#f472b6"],
  ["21LEM201T", "Professional Ethics", 0, "theory", "#fb7185"],
].map(([code, name, credits, type, color_hex], i) => ({
  id: uid("sub", i),
  device_id: PIN,
  code,
  name,
  credits,
  type,
  faculty: "Dr. Placeholder",
  color_hex,
  internal_only: false,
  created_at: new Date().toISOString(),
}));

const TIMES = [
  ["08:00:00", "08:50:00"],
  ["08:50:00", "09:40:00"],
  ["10:00:00", "10:50:00"],
  ["11:00:00", "11:50:00"],
  ["12:00:00", "12:50:00"],
];

const TIMETABLE = [];
let slotN = 0;
for (let day = 1; day <= 5; day++) {
  for (let p = 0; p < TIMES.length; p++) {
    const s = SUBJECTS[(day + p) % SUBJECTS.length];
    TIMETABLE.push({
      id: uid("slot", slotN++),
      device_id: PIN,
      subject_id: s.id,
      day_order: day,
      start_time: TIMES[p][0],
      end_time: TIMES[p][1],
      room: `TP${300 + p}`,
      slot_type: "theory",
    });
  }
}

// Portal snapshot dated a week back, so the Attendance page shows the
// "portal totals as of …" badge and the layering path is exercised.
const AS_OF = (() => {
  const d = daysBack(7);
  return d.toLocaleDateString("en-CA");
})();

const SNAPSHOTS = [
  ["21CSC201J", 45, 5],
  ["21CSC202J", 42, 11],
  ["21DCS201P", 30, 2],
  ["21MAB201T", 40, 12],
].map(([subject_code, conducted, absent], i) => ({
  id: uid("snap", i),
  device_id: PIN,
  subject_code,
  conducted,
  absent,
  percentage: Number((((conducted - absent) / conducted) * 100).toFixed(2)),
  as_of: AS_OF,
  synced_at: new Date().toISOString(),
}));

// Sync history (migration 029): three earlier syncs a week apart, then the current snapshot. 21MAB201T's latest sync reports fewer classes held than the one before - deliberately, so the Attendance page's portal check has something to show in the preview.
const SNAPSHOT_HISTORY = SNAPSHOTS.flatMap((snap, i) => {
  const rows = [3, 2, 1].map((weeksBack) => {
    const d = daysBack(7 + weeksBack * 7);
    const day = d.toLocaleDateString("en-CA");
    const conducted = snap.conducted - weeksBack * 5 + (snap.subject_code === "21MAB201T" && weeksBack === 1 ? 7 : 0);
    const absent = Math.max(0, snap.absent - weeksBack);
    return {
      id: uid("hist", i * 10 + weeksBack),
      device_id: PIN,
      subject_code: snap.subject_code,
      conducted,
      absent,
      percentage: Number((((conducted - absent) / conducted) * 100).toFixed(2)),
      as_of: day,
      synced_at: `${day}T12:00:00.000Z`,
      source: "bookmarklet",
    };
  });
  return [...rows, { ...snap, id: uid("hist", i * 10), source: "bookmarklet" }];
});

// A few classes marked by hand since the snapshot, plus history for the
// two subjects the portal doesn't cover.
const ATTENDANCE = [];
let attN = 0;
for (let back = 6; back >= 1; back--) {
  const d = daysBack(back);
  const date = d.toLocaleDateString("en-CA");
  if ([0, 6].includes(d.getDay())) continue;
  SUBJECTS.slice(0, 4).forEach((s, i) => {
    ATTENDANCE.push({
      id: uid("att", attN++),
      device_id: PIN,
      subject_id: s.id,
      date,
      start_time: TIMES[i][0],
      end_time: TIMES[i][1],
      status: (back + i) % 5 === 0 ? "absent" : "present",
    });
  });
}
for (let back = 40; back >= 1; back--) {
  const d = daysBack(back);
  if ([0, 6].includes(d.getDay())) continue;
  const date = d.toLocaleDateString("en-CA");
  SUBJECTS.slice(4).forEach((s, i) => {
    ATTENDANCE.push({
      id: uid("att", attN++),
      device_id: PIN,
      subject_id: s.id,
      date,
      start_time: TIMES[i][0],
      end_time: TIMES[i][1],
      status: back % 7 === 0 ? "absent" : "present",
    });
  });
}

const MARKS = [];
let markN = 0;
SUBJECTS.forEach((s, i) => {
  if (s.credits === 0) return;
  MARKS.push({
    id: uid("mark", markN++),
    device_id: PIN,
    subject_id: s.id,
    component_type: "CT",
    label: "CT1",
    marks_obtained: 34 + ((i * 3) % 14),
    max_marks: 50,
    is_external: false,
    source: i % 2 === 0 ? "portal" : "manual",
    added_at: new Date().toISOString(),
  });
  MARKS.push({
    id: uid("mark", markN++),
    device_id: PIN,
    subject_id: s.id,
    component_type: "Assignment",
    label: "Assignment 1",
    marks_obtained: 8 + (i % 3),
    max_marks: 10,
    is_external: false,
    source: "manual",
    added_at: new Date().toISOString(),
  });
});

const DEVICE_OWNERS = [
  {
    device_id: PIN,
    user_id: "00000000-0000-4000-8000-000000000000",
    claimed_at: new Date().toISOString(),
  },
];

const STUDY_DIR = (process.env.STUDY_DIR || "~/Documents/SRM_Sem3").replace(/^~(?=$|\/)/, homedir());

/** The seeded semester. Each caller works on its own copy (stateOf). */
const SEED = {
  device_owners: DEVICE_OWNERS,
  settings: [
    {
      id: uid("set", 0),
      device_id: PIN,
      name: "Kunal",
      semester: 3,
      target_sgpa: 8.5,
      min_attendance: 75,
      sem_start: SEM_START,
      sem_end: SEM_END,
      declared_holidays: [],
      current_day_order: 1,
      // Migration 018. Null is the interesting case: it means this
      // account has never picked a theme, so the app publishes whatever
      // the device is already using rather than being reset by a default.
      theme: null,
      theme_mode: null,
    },
  ],
  subjects: SUBJECTS,
  timetable_slots: TIMETABLE,
  attendance: ATTENDANCE,
  marks: MARKS,
  deadlines: [
    {
      id: uid("dl", 0),
      device_id: PIN,
      subject_id: SUBJECTS[0].id,
      title: "DSA Lab Record",
      type: "lab",
      due_date: new Date(Date.now() + 3 * 864e5).toISOString(),
      status: "pending",
      priority: "high",
    },
    {
      id: uid("dl", 1),
      device_id: PIN,
      subject_id: SUBJECTS[3].id,
      title: "Unit Test 2",
      type: "exam",
      due_date: new Date(Date.now() + 9 * 864e5).toISOString(),
      status: "pending",
      priority: "medium",
    },
  ],
  portal_snapshots: SNAPSHOTS,
  // Migration 026, seeded from the scan's real findings when they exist,
  // so Today's "Found in your files" card previews with real rows.
  suggestions: (() => {
    const file = path.join(STUDY_DIR, "_src", "acadkit_suggestions.json");
    if (!existsSync(file)) return [];
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const plans = (raw.plans ?? []).map((p, i) => ({
      id: uid("plan", i),
      device_id: PIN,
      key: `mock-plan-${i}`,
      kind: "plan",
      payload: { subject_code: p.subject_code, internal: p.internal, components: p.components },
      source: p.source ?? null,
      evidence: p.evidence ?? null,
      status: "pending",
      created_at: new Date().toISOString(),
    }));
    return plans.concat((raw.deadlines ?? []).map((d, i) => ({
      id: uid("sug", i),
      device_id: PIN,
      key: `mock-${i}`,
      kind: "deadline",
      payload: d,
      source: d.source ?? null,
      evidence: d.evidence ?? null,
      status: "pending",
      created_at: new Date().toISOString(),
    })));
  })(),
  semester_archives: [],
  // Rows keep whatever the app sends, vapid_public (migration 041) included.
  push_subscriptions: [],
  // Migrations 029 and 030. study_chunks stays empty: the preview has no
  // embedder, so search inside files finds only lectures (mockStudySearch).
  portal_snapshot_history: SNAPSHOT_HISTORY,
  forecast_log: [],
  study_chunks: [],
  // Migration 032: files deleted in the app, for the Mac to trash.
  study_file_deletions: [],
  // Migration 033.
  study_uploads: [],
  // Migration 034.
  syllabus_progress: [],
  // Migration 039.
  active_days: [],
  // Migration 043: run-up tasks ticked as done.
  plan_ticks: [],
  // Migration 045: where each flashcard stands.
  card_reviews: [],
  // Migration 047: the feeds' private token.
  feed_tokens: [],
  // Migration 051: what Siri marked, for Today's Undo.
  siri_marks: [],
  // Migration 053: what Autopilot added, for Today's Undo.
  autopilot_actions: [],
  // Migration 061: lectures the Mac recorded, and their moments.
  lectures: [],
  lecture_moments: [],
  // Migration 062: where you're reading, for Continue.
  reading_now: [],
};

/**
 * The data, one copy per e2e worker: each sends its number in the
 * x-mock-db header (e2e/fixtures.ts), so specs run side by side without
 * writing into each other's semester. The preview sends none and gets "".
 * `stored` holds the objects the app (or a spec) writes into storage: the
 * inbox and the switch status (scripts/lib/semester.mjs).
 */
const states = new Map();
const freshState = () => ({ db: structuredClone(SEED), stored: new Map() });
const stateKey = (req) => String(req.headers["x-mock-db"] ?? "");
function stateOf(req) {
  if (!states.has(stateKey(req))) states.set(stateKey(req), freshState());
  return states.get(stateKey(req));
}

let seq = 1000;

/** Apply PostgREST-style `col=eq.value` / `in.(…)` filters. */
function filter(rows, params) {
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "on_conflict"].includes(k)) continue;
    const eq = v.match(/^eq\.(.*)$/);
    if (eq) {
      rows = rows.filter((r) => String(r[k]) === eq[1]);
      continue;
    }
    const inn = v.match(/^in\.\((.*)\)$/);
    if (inn) {
      const set = inn[1].split(",").map((s) => s.replace(/^"|"$/g, ""));
      rows = rows.filter((r) => set.includes(String(r[k])));
      continue;
    }
    if (v === "is.null") rows = rows.filter((r) => r[k] == null);
    const cmp = v.match(/^(gte|lte)\.(.*)$/);
    if (cmp) rows = rows.filter((r) => (cmp[1] === "gte" ? String(r[k]) >= cmp[2] : String(r[k]) <= cmp[2]));
  }
  return rows;
}

/** Previews' keys → their files: a note's web version, or the copy of an Office file the sync converted (if it has). */
const previewFiles = new Map();
const RENDITIONS = path.join(homedir(), "Library", "Caches", "AcadKit", "renditions");
function previewFor(p, i) {
  const ext = path.extname(p).slice(1).toLowerCase();
  let full = null;
  if (ext === "pdf") full = path.join(STUDY_DIR, "_src", "_html", p.replace(/\.pdf$/i, ".html"));
  else if (RENDITION[ext]) {
    const sha = createHash("sha256").update(readFileSync(path.join(STUDY_DIR, p))).digest("hex");
    full = path.join(RENDITIONS, `${sha}.${RENDITION[ext]}`);
  }
  if (!full || !existsSync(full)) return null;
  const to = path.extname(full).slice(1);
  const key = `1234/blobs/${i}.preview.${to}`;
  previewFiles.set(key, full);
  return { key, ext: to };
}

/**
 * The study folder, listed the way scripts/sync-study-folder.mjs would
 * (same skip rules), but keyed by index instead of content hash - the
 * preview never uploads, so there's nothing to hash for.
 */
const studyFiles = (() => {
  if (!existsSync(STUDY_DIR)) return [];
  const out = [];
  const walk = (rel) => {
    for (const e of readdirSync(path.join(STUDY_DIR, rel), { withFileTypes: true })) {
      if (/^[._]|^~\$/.test(e.name)) continue;
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(child);
      else if (e.isFile()) out.push(child);
    }
  };
  walk("");
  // Tagged the way the sync tags them (scripts/lib/tags.mjs), for the subject pages.
  const subjects = subjectIndex([...new Set(out.filter((p) => p.includes("/")).map((p) => p.split("/")[0]))]);
  return out.sort().map((p, i) => {
    const st = statSync(path.join(STUDY_DIR, p));
    const preview = previewFor(p, i);
    return {
      path: p,
      size: st.size,
      mtime: Math.round(st.mtimeMs),
      key: `1234/blobs/${i}${path.extname(p).toLowerCase()}`,
      ...tagFile(p, subjects),
      ...(preview ? { preview } : {}),
    };
  });
})();
const studyByKey = new Map(studyFiles.map((f) => [f.key, f]));

function mockStorage(req, res, u, { stored }) {
  const json = (code, body) => res.writeHead(code, { "content-type": "application/json" }).end(JSON.stringify(body));
  const p = decodeURIComponent(u.pathname.replace(/^\/storage\/v1/, ""));
  if (req.method === "POST" && p === "/object/sign/study-files") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    return req.on("end", () => {
      const { paths = [] } = JSON.parse(raw || "{}");
      json(200, paths.map((k) => ({ path: k, signedURL: `/object/sign/study-files/${k}?token=mock`, error: null })));
    });
  }
  // One signed link (the viewer's Download button, Settings' Shortcuts), for an object that is there.
  if (req.method === "POST" && p.startsWith("/object/sign/study-files/")) {
    const key = p.slice("/object/sign/study-files/".length);
    if (!studyByKey.has(key) && !previewFiles.has(key) && !stored.has(key))
      return json(400, { statusCode: "404", error: "not_found", message: "Object not found" });
    return json(200, { signedURL: `${p}?token=mock` });
  }
  // Listing a folder (supabase-js: POST /object/list/<bucket> { prefix }), for the inbox.
  if (req.method === "POST" && p === "/object/list/study-files") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    return req.on("end", () => {
      const prefix = `${JSON.parse(raw || "{}").prefix ?? ""}`.replace(/\/?$/, "/");
      const names = [...stored.keys()].filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"));
      json(200, names.map((k) => ({ name: k.slice(prefix.length), id: k, metadata: { size: stored.get(k).length } })));
    });
  }
  // Removing (supabase-js: DELETE /object/<bucket> { prefixes }).
  if (req.method === "DELETE" && p === "/object/study-files") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    return req.on("end", () => {
      const gone = (JSON.parse(raw || "{}").prefixes ?? []).filter((k) => stored.delete(k));
      json(200, gone.map((name) => ({ name })));
    });
  }
  const m = p.match(/^\/object\/(?:sign\/|authenticated\/)?study-files\/(.+)$/);
  if (!m) return json(404, { statusCode: "404", error: "not_found", message: "Object not found" });
  // Writing (supabase-js upload: POST, or PUT to replace).
  if (req.method === "POST" || req.method === "PUT") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    return req.on("end", () => {
      stored.set(m[1], Buffer.concat(chunks).toString());
      json(200, { Key: `study-files/${m[1]}`, Id: m[1] });
    });
  }
  if (stored.has(m[1])) {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(stored.get(m[1]));
  }
  if (m[1] === "1234/prep.json") {
    const file = path.join(STUDY_DIR, "_src", "acadkit_prep.json");
    if (!existsSync(file)) return json(400, { statusCode: "404", error: "not_found", message: "Object not found" });
    return json(200, { ...JSON.parse(readFileSync(file, "utf8")), generatedAt: Date.now() });
  }
  // The Study page's "This week" notices and "Projects" card, checked as the real sync checks them.
  if (m[1] === "1234/notices.json" || m[1] === "1234/projects.json") {
    const notices = m[1] === "1234/notices.json";
    const file = path.join(STUDY_DIR, "_src", notices ? "acadkit_notices.json" : "acadkit_projects.json");
    if (!existsSync(file)) return json(400, { statusCode: "404", error: "not_found", message: "Object not found" });
    const raw = JSON.parse(readFileSync(file, "utf8"));
    return json(200, (notices ? checkNotices(raw, new Set(studyFiles.map((f) => f.path))) : checkProjects(raw)).body);
  }
  // The Run-up page's plan, checked and split as the real sync checks and splits it.
  if (m[1] === "1234/runup.json" || m[1].startsWith("1234/runup/")) {
    const file = path.join(STUDY_DIR, "_src", "acadkit_runup.json");
    const checked = existsSync(file) && checkRunup(JSON.parse(readFileSync(file, "utf8")), new Set(studyFiles.map((f) => f.path)));
    if (!checked?.body) return json(400, { statusCode: "404", error: "not_found", message: "Object not found" });
    const { index, parts } = splitRunup(checked.body);
    if (m[1] === "1234/runup.json") return json(200, index);
    const part = parts.find((p) => `1234/${p.name}` === m[1]);
    if (!part) return json(400, { statusCode: "404", error: "not_found", message: "Object not found" });
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(part.json);
  }
  // The flashcards, checked as the real sync checks them.
  if (m[1] === "1234/cards.json") {
    const file = path.join(STUDY_DIR, "_src", "acadkit_cards.json");
    const checked = existsSync(file) && checkCards(JSON.parse(readFileSync(file, "utf8")));
    if (!checked?.body) return json(400, { statusCode: "404", error: "not_found", message: "Object not found" });
    return json(200, checked.body);
  }
  // What the sync measures of the bucket (scripts/lib/storage.mjs): the folder's bytes, against the free plan.
  if (m[1] === "1234/storage.json") {
    const used = studyFiles.reduce((n, f) => n + f.size, 0);
    return json(200, { version: 1, used, limit: STORAGE_LIMIT, cap: UPLOAD_CAP, refused: [], at: Date.now() });
  }
  if (m[1] === "1234/units.json") {
    // The syllabi as units. Notes are matched by the unit tag alone (the
    // real sync matches by meaning), so the "no notes" gaps still show.
    const file = path.join(STUDY_DIR, "_src", "acadkit_syllabi.json");
    if (!existsSync(file)) return json(400, { statusCode: "404", error: "not_found", message: "Object not found" });
    const { courses } = JSON.parse(readFileSync(file, "utf8"));
    const out = {};
    for (const [code, c] of Object.entries(courses)) {
      const own = studyFiles.filter((f) => f.subject_code === code && f.kind !== "syllabus" && f.kind !== "pyq");
      out[code] = {
        ...c,
        hasFiles: own.length > 0,
        units: c.units.map((u) => ({ ...u, refs: [], files: own.filter((f) => f.unit === u.n).length })),
      };
    }
    return json(200, { version: 1, generatedAt: Date.now(), courses: out });
  }
  if (m[1] === "1234/curriculum.json") {
    const file = path.join(STUDY_DIR, "_src", "acadkit_curriculum.json");
    if (!existsSync(file)) return json(400, { statusCode: "404", error: "not_found", message: "Object not found" });
    return json(200, JSON.parse(readFileSync(file, "utf8")));
  }
  if (m[1] === "1234/manifest.json") {
    if (!studyFiles.length) return json(400, { statusCode: "404", error: "not_found", message: "Object not found" });
    return json(200, { version: 1, root: path.basename(STUDY_DIR), syncedAt: Date.now(), files: studyFiles });
  }
  const f = studyByKey.get(m[1]);
  const shown = f ? path.join(STUDY_DIR, f.path) : previewFiles.get(m[1]);
  if (!shown) return json(400, { statusCode: "404", error: "not_found", message: "Object not found" });
  res.writeHead(200, { "content-type": "application/octet-stream" });
  return res.end(readFileSync(shown));
}

const server = createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  // Named, as Supabase names them: a "*" doesn't cover Authorization, and browsers say so.
  res.setHeader("access-control-allow-headers", req.headers["access-control-request-headers"] ?? "authorization, apikey, content-type, x-client-info, x-mock-db");
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("access-control-expose-headers", "content-range");
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  const u = new URL(req.url, "http://x");

  // ---- test reset ---- e2e/fixtures.ts calls this before every spec, so each one starts from the seeded semester whatever an earlier spec (or a retry) wrote.
  if (req.method === "POST" && u.pathname === "/__reset") {
    states.set(stateKey(req), freshState());
    return res.writeHead(204).end();
  }
  const state = stateOf(req);

  // ---- auth ---- The app gates on a Supabase session now, so the mock has to hand one out or the preview never gets past the sign-in screen.
  if (u.pathname.startsWith("/auth/v1/")) {
    let raw = "";
    req.on("data", (c) => (raw += c));
    return req.on("end", () => authReply(req, res, u, raw));
  }

  // ---- storage (study files) ---- Serves the real study folder from this Mac, so /files previews with real names and sizes.
  if (u.pathname.startsWith("/storage/v1/")) return mockStorage(req, res, u, state);

  // ---- the feeds ---- The real handler (supabase/functions/feeds/handle.ts) on the mock's tables.
  if (u.pathname.startsWith("/functions/v1/feeds/")) return mockFeeds(req, res, u, state);

  // ---- study search ---- Without its model: word overlap stands in for meaning.
  if (u.pathname === "/functions/v1/study-search") return mockStudySearch(req, res, state);

  handleRest(req, res, u, state);
});

/**
 * Study search without gte-small: no passages (study_chunks is empty), and
 * each lecture moment 0.7 like the query plus up to 0.25 for the share of
 * the query's words it has. One with them all clears the app's bar for
 * showing a moment (MOMENT_NEAR, src/lib/lectures.ts); one with none doesn't.
 */
function mockStudySearch(req, res, { db }) {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const { query = "", device_id } = JSON.parse(body || "{}");
    const words = [...new Set(String(query).toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
    const moments = db.lecture_moments
      .filter((m) => m.device_id === device_id)
      .map((m) => {
        const l = db.lectures.find((x) => x.id === m.lecture_id);
        const said = m.content.toLowerCase();
        const share = words.length ? words.filter((w) => said.includes(w)).length / words.length : 0;
        return { lecture_id: m.lecture_id, idx: m.idx, start_s: m.start_s, page: m.page, content: m.content, similarity: 0.7 + 0.25 * share, date: l?.date, start_time: l?.start_time, subject_code: l?.subject_code ?? null, deck: l?.deck ?? null };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 6);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ results: [], moments }));
  });
}

/**
 * The feeds, run by their real handler with the mock's tables behind it:
 * Siri's ask, the share endpoint, today and the calendar, for the e2e specs.
 * Its clock is the specs' frozen morning (7:30 IST on MOCK_TODAY) when set.
 */
function mockFeeds(req, res, u, { db, stored }) {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    const mine = (table, pin) => db[table].filter((r) => r.device_id === pin);
    const deps = {
      use: async (token) => {
        const row = db.feed_tokens.find((t) => t.token === token);
        if (!row || !db.device_owners.some((o) => o.device_id === row.device_id)) return null;
        row.last_used_at = new Date().toISOString();
        return { pin: row.device_id, allowed: true };
      },
      load: async (pin) => ({
        settings: mine("settings", pin)[0] ?? null,
        subjects: mine("subjects", pin),
        slots: mine("timetable_slots", pin),
        attendance: mine("attendance", pin),
        snapshots: mine("portal_snapshots", pin),
        deadlines: mine("deadlines", pin).filter((d) => d.status === "pending"),
        marks: mine("marks", pin),
      }),
      share: async (pin, f) => {
        stored.set(f.key, Buffer.from(f.bytes).toString());
        db.study_uploads.push({ id: uid("upl", ++seq), device_id: pin, path: f.path, key: f.key, size: f.bytes.length, status: "pending", created_at: new Date().toISOString() });
      },
      markAbsent: async (pin, said, rows) => {
        for (const r of rows) {
          const { before: _before, ...row } = r;
          const hit = db.attendance.find((a) => a.device_id === pin && a.subject_id === r.subject_id && a.date === r.date && a.start_time === r.start_time);
          if (hit) Object.assign(hit, { status: "absent", auto_marked: false });
          else db.attendance.push({ id: uid("att", ++seq), ...row, device_id: pin, status: "absent", auto_marked: false });
        }
        db.siri_marks.push({ id: uid("siri", ++seq), device_id: pin, said, rows, created_at: new Date().toISOString(), undone_at: null });
      },
      now: () => (process.env.MOCK_TODAY ? new Date(`${process.env.MOCK_TODAY}T07:30:00+05:30`) : new Date()),
    };
    const body = chunks.length && req.method !== "GET" ? Buffer.concat(chunks) : undefined;
    const answer = await feedsHandle(new Request(`http://127.0.0.1:${PORT}${req.url}`, { method: req.method, headers: req.headers, body }), deps);
    res.writeHead(answer.status, Object.fromEntries(answer.headers));
    res.end(Buffer.from(await answer.arrayBuffer()));
  });
}

/** The seeded account, and the one an email starting with "new" signs in to: no PIN yet, so the app shows onboarding. */
const SEEDED_USER = "00000000-0000-4000-8000-000000000000";
const NEW_USER = "11111111-1111-4111-8111-111111111111";

/** Which account a request comes from: the access token names it. */
function userOf(req) {
  return (req.headers.authorization || "").match(/mock-access-token\.([0-9a-f-]{36})/)?.[1] ?? SEEDED_USER;
}

function authReply(req, res, u, raw) {
  let uid = userOf(req);
  let email = "you@localhost.mock";
  if (u.pathname.endsWith("/token") && raw) {
    try {
      const body = JSON.parse(raw);
      if (body.email) {
        email = body.email;
        uid = /^new/i.test(email) ? NEW_USER : SEEDED_USER;
      } else {
        // A refresh: the e2e tests pin the clock past this token's expiry,
        // so the app swaps it straight away. Same account as before.
        uid = String(body.refresh_token ?? "").match(/mock-refresh-token\.([0-9a-f-]{36})/)?.[1] ?? uid;
      }
    } catch {
      /* not JSON: keep the account from the access token */
    }
  }
  {
    const session = {
      access_token: `mock-access-token.${uid}`,
      refresh_token: `mock-refresh-token.${uid}`,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: uid,
        aud: "authenticated",
        role: "authenticated",
        email,
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      },
    };
    res.writeHead(200, { "content-type": "application/json" });
    // /logout returns no body; everything else gets the session.
    res.end(u.pathname.includes("logout") ? "" : JSON.stringify(session));
  }
}

function handleRest(req, res, u, { db }) {
  const table = u.pathname.replace(/^\/rest\/v1\//, "");
  if (!(table in db)) {
    res.writeHead(404, { "content-type": "application/json" });
    // PostgREST's own code for a table it doesn't know, which the app checks for (isMissingTable).
    return res.end(JSON.stringify({ code: "PGRST205", message: `relation "${table}" does not exist` }));
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const json = body ? JSON.parse(body) : null;
    // maybeSingle()/single() ask for one object rather than an array.
    const single = (req.headers.accept || "").includes("pgrst.object");
    const reply = (code, data, headers = {}) => {
      res.writeHead(code, { "content-type": "application/json", ...headers });
      res.end(data === undefined || req.method === "HEAD" ? "" : JSON.stringify(data));
    };

    if (req.method === "GET" || req.method === "HEAD") {
      let rows = filter(db[table], u.searchParams);
      // Row-level security, for the one table where it decides what the app does: each account sees only its own PIN claims.
      if (table === "device_owners") rows = rows.filter((r) => r.user_id === userOf(req));
      const order = u.searchParams.get("order");
      if (order) {
        const [col, dir] = order.split(".");
        rows = [...rows].sort((a, b) =>
          String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0
        );
        if (dir === "desc") rows.reverse();
      }
      // select(..., { count: "exact", head: true }) reads the count from here.
      const count = (req.headers.prefer || "").includes("count=exact")
        ? { "content-range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0" }
        : {};
      return reply(200, single ? rows[0] ?? null : rows, count);
    }

    if (req.method === "POST") {
      const rows = Array.isArray(json) ? json : [json];
      // A PIN has one owner: claiming a taken one fails the way the primary key makes it fail.
      if (table === "device_owners" && rows.some((r) => db.device_owners.some((o) => o.device_id === r.device_id)))
        return reply(409, { code: "23505", message: "duplicate key value violates unique constraint" });
      // One row per account per day (the primary key): a plain insert of a day already recorded fails.
      if (
        table === "active_days" &&
        !u.searchParams.get("on_conflict") &&
        rows.some((r) => db.active_days.some((d) => d.device_id === r.device_id && d.day === r.day))
      )
        return reply(409, { code: "23505", message: "duplicate key value violates unique constraint \"active_days_pkey\"" });
      // The database makes a feed token; the app may send only its PIN (migration 047's column grant).
      if (table === "feed_tokens") {
        if (rows.some((r) => "token" in r)) return reply(403, { code: "42501", message: "permission denied for table feed_tokens" });
        if (rows.some((r) => db.feed_tokens.some((t) => t.device_id === r.device_id)))
          return reply(409, { code: "23505", message: "duplicate key value violates unique constraint \"feed_tokens_pkey\"" });
        for (const r of rows) Object.assign(r, { token: randomBytes(24).toString("hex"), created_at: new Date().toISOString(), last_used_at: null });
      }
      const conflict = (u.searchParams.get("on_conflict") || "").split(",").filter(Boolean);
      const out = [];
      for (const row of rows) {
        const hit = conflict.length
          ? db[table].find((r) => conflict.every((c) => r[c] === row[c]))
          : null;
        if (hit) Object.assign(hit, row), out.push(hit);
        else {
          const fresh = { id: uid(table.slice(0, 3), ++seq), ...row };
          db[table].push(fresh);
          out.push(fresh);
        }
      }
      return reply(201, single ? out[0] ?? null : out);
    }

    if (req.method === "PATCH") {
      const rows = filter(db[table], u.searchParams);
      rows.forEach((r) => Object.assign(r, json));
      return reply(200, single ? rows[0] ?? null : rows);
    }

    if (req.method === "DELETE") {
      const doomed = new Set(filter(db[table], u.searchParams));
      db[table] = db[table].filter((r) => !doomed.has(r));
      return reply(200, []);
    }
    reply(405, { message: "not implemented in the mock" });
  });
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  mock Supabase  →  http://127.0.0.1:${PORT}`);
  console.log(`  seeded PIN     →  ${PIN}  (any email and password signs in to it)`);
  console.log(`  portal snapshot as of ${AS_OF} on 4 of 6 subjects\n`);
  // MOCK_NO_VITE: only the backend, for a production build served elsewhere (scripts/lighthouse-screens.mjs).
  if (process.env.MOCK_NO_VITE) return;

  const vite = spawn("npx", ["vite"], {
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_SUPABASE_URL: `http://127.0.0.1:${PORT}`,
      VITE_SUPABASE_ANON_KEY: "mock-anon-key",
    },
  });
  const bye = () => {
    vite.kill();
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", bye);
  process.on("SIGTERM", bye);
  vite.on("exit", bye);
});
