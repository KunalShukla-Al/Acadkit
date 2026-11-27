/**
 * Keeps the Mac's Study Desk app and AcadKit's Desk on one progress store
 * (scripts/lib/desk-bridge.mjs). Runs at the end of each sync, and on its own:
 *
 *   node scripts/desk-bridge.mjs
 *
 * The app's state is read from its SQLite; rows the Desk changed are written
 * back only while the app is closed, since the open app saves over its file.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { applyToSem3, applyToSem4, plan, rowValue, rowsFromSem3, rowsFromSem4 } from "./lib/desk-bridge.mjs";

const APP_DIR = path.join(homedir(), "Library/Application Support/com.kunal.sem3-study-desk");
const SNAP = path.join(homedir(), ".config/acadkit/desk-bridge.json");
const APP = "StudyDesk";

const SEMESTERS = [
  { id: "sem3", db: "progress.sqlite", toRows: (s) => rowsFromSem3(s), apply: (s, k, r) => applyToSem3(s, k, r), owns: (k) => k.startsWith("OS/") },
  { id: "sem4", db: "progress-sem4.sqlite", sem4: true },
];

// Loaded when first needed, so a Node without node:sqlite fails only the bridge, never the sync that runs it.
const sqlite = () => import("node:sqlite");

async function readState(file) {
  const { DatabaseSync } = await sqlite();
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const row = db.prepare("SELECT json FROM state WHERE id = 1").get();
    return row ? JSON.parse(row.json) : null;
  } finally {
    db.close();
  }
}

async function writeState(file, state) {
  const { DatabaseSync } = await sqlite();
  const db = new DatabaseSync(file);
  try {
    const json = JSON.stringify(state);
    const now = new Date().toISOString();
    db.prepare("UPDATE state SET updated_at = ?, saved_at = ?, json = ? WHERE id = 1").run(state.updatedAt, now, json);
    db.prepare("INSERT INTO history (updated_at, saved_at, json) VALUES (?, ?, ?)").run(state.updatedAt, now, json);
  } finally {
    db.close();
  }
}

const appOpen = () => {
  try {
    execFileSync("pgrep", ["-x", APP], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

/** Practice ids ↔ Desk keys for Sem 4, from its desk file. */
async function sem4Keys(dir) {
  const file = path.join(dir, "_src", "acadkit_desk.json");
  const byId = new Map();
  if (!existsSync(file)) return byId;
  const desk = JSON.parse(await readFile(file, "utf8"));
  for (const c of desk.courses ?? []) for (const it of c.items ?? []) byId.set(it.key.slice(c.key.length + 1), it.key);
  return byId;
}

/** One pass over both semesters. Returns counts; `log` gets one line per semester. */
export async function bridgeDesk({ supabase, pin, sem4Dir, log = console.log }) {
  if (!existsSync(APP_DIR)) return { pushed: 0, pulled: 0 };
  const { data, error } = await supabase.from("desk_progress").select("item_key, status, flag, pick, attempted_at, result, note, updated_at").eq("device_id", pin);
  if (error) throw new Error(error.message);
  const remoteAll = Object.fromEntries((data ?? []).map((r) => [r.item_key, r]));
  const snapAll = existsSync(SNAP) ? JSON.parse(await readFile(SNAP, "utf8")) : {};
  const ids = sem4Dir ? await sem4Keys(sem4Dir) : new Map();
  const keys = new Map([...ids].map(([id, key]) => [key, id]));
  const open = appOpen();
  let pushed = 0;
  let pulled = 0;

  for (const sem of SEMESTERS) {
    const file = path.join(APP_DIR, sem.db);
    if (!existsSync(file)) continue;
    const state = await readState(file);
    if (!state) continue;
    const toRows = sem.sem4 ? (s) => rowsFromSem4(s, (id) => ids.get(id) ?? null) : sem.toRows;
    const apply = sem.sem4 ? (s, k, r) => applyToSem4(s, k, r, (key) => keys.get(key) ?? null) : sem.apply;
    const owns = sem.sem4 ? (k) => k.startsWith("topic:") || k.startsWith("video:") || keys.has(k) : sem.owns;
    const mac = toRows(state);
    const remote = Object.fromEntries(Object.entries(remoteAll).filter(([k]) => owns(k)));
    const snap = snapAll[sem.id] ?? {};
    const { push, pull } = plan(mac, remote, snap);

    if (push.length) {
      const { error: upErr } = await supabase
        .from("desk_progress")
        .upsert(push.map((r) => ({ device_id: pin, status: null, flag: false, pick: null, attempted_at: null, result: null, note: null, ...r })), { onConflict: "device_id,item_key" });
      if (upErr) throw new Error(upErr.message);
    }
    let applied = 0;
    if (pull.length && !open) {
      state.topics ??= {};
      state.watched ??= {};
      state.practice ??= {};
      state.items ??= {};
      for (const r of pull) if (apply(state, r.item_key, r)) applied++;
      state.updatedAt = Date.now();
      await writeState(file, state);
    }
    // In step now: what was sent, what was written, and what already agreed.
    const next = {};
    for (const [k, m] of Object.entries(mac)) next[k] = rowValue(m);
    for (const r of push) next[r.item_key] = rowValue(r);
    if (applied) for (const r of pull) next[r.item_key] = rowValue(r);
    else for (const r of pull) if (snap[r.item_key] !== undefined) next[r.item_key] = snap[r.item_key];
    snapAll[sem.id] = next;
    pushed += push.length;
    pulled += applied;
    log(`Desk progress (${sem.id}): ${push.length} sent from the Mac app${pull.length ? `, ${open && !applied ? `${pull.length} waiting for the app to close` : `${applied} written into it`}` : ""}`);
  }
  await mkdir(path.dirname(SNAP), { recursive: true });
  await writeFile(SNAP, JSON.stringify(snapAll));
  return { pushed, pulled };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { macClient } = await import("./lib/mac-client.mjs");
  const { studyRoots } = await import("./lib/roots.mjs");
  const { dir, extras } = studyRoots();
  const supabase = macClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const sem4Dir = [dir, ...extras.map((x) => x.dir)].find((d) => /Sem4$/i.test(d)) ?? null;
  await bridgeDesk({ supabase, pin: process.env.STUDY_PIN, sem4Dir });
}
