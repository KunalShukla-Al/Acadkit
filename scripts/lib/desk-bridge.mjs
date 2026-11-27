/**
 * One progress store for the Mac's Study Desk app and AcadKit's Desk
 * (docs/desk.md): the app's saved state (its progress SQLite) and the
 * desk_progress table (migration 065), kept in step at each sync.
 *
 * The app keeps one JSON state per semester. Sem 4's has topics, watched
 * videos and practice picks; Sem 3's has question records and graded
 * practice. Both map onto rows keyed as the Desk keys them:
 *
 *   question    "<course>/<item id>"   status, flag, note, pick, result, attempted_at
 *   topic       "topic:<course>:<unit>.<topic>"   status
 *   video       "video:<YouTube id>"   attempted_at (watched)
 *
 * A snapshot of what was last in step tells a change on the Mac (its value
 * moved from the snapshot) from one in AcadKit (the row moved). The later
 * write wins: the table keeps the newer row (065's trigger), and a newer row
 * is written into the app's state while the app is closed.
 */

const LETTERS = "ABCDEF";
const STATUSES = new Set(["new", "learning", "done", "revise"]);

/** The parts of a row the two sides share; equal values mean nothing to send. */
export function rowValue(r) {
  return JSON.stringify([r.status ?? null, !!r.flag, r.pick ?? null, r.attempted_at ? 1 : 0, r.result ?? null, r.note || null]);
}

const iso = (ms) => (ms ? new Date(ms).toISOString() : null);

/** `{ key: row }` from a Sem 4 desk state (desk.js: topics, watched, practice). `keyOf` maps a practice id to its Desk key. */
export function rowsFromSem4(state, keyOf) {
  const at = iso(state?.updatedAt) ?? new Date(0).toISOString();
  const rows = {};
  for (const [k, status] of Object.entries(state?.topics ?? {})) {
    const [course, unit, topic] = k.split(":");
    if (!course || !STATUSES.has(status)) continue;
    rows[`topic:${course}:${unit}.${topic}`] = { status, updated_at: at };
  }
  for (const [id, when] of Object.entries(state?.watched ?? {})) {
    if (when) rows[`video:${id}`] = { attempted_at: when, updated_at: at };
  }
  for (const [id, p] of Object.entries(state?.practice ?? {})) {
    const key = keyOf(id);
    if (!key || !p) continue;
    const pick = Number.isInteger(p.pick) ? LETTERS[p.pick] ?? null : null;
    rows[key] = { flag: !!p.revise, pick, attempted_at: p.done || null, result: pick ? "unreviewed" : null, updated_at: at };
  }
  return rows;
}

/** `{ key: row }` from a Sem 3 state (kunal-sem3-v1: items "q/<course>/<id>", practice "<course>/<id>"). */
export function rowsFromSem3(state) {
  const rows = {};
  for (const [k, it] of Object.entries(state?.items ?? {})) {
    if (!k.startsWith("q/") || !it) continue;
    const key = k.slice(2);
    rows[key] = {
      ...rows[key],
      status: STATUSES.has(it.status) ? it.status : null,
      flag: !!it.flag,
      note: it.note || null,
      updated_at: iso(it.updatedAt) ?? new Date(0).toISOString(),
    };
  }
  for (const [key, p] of Object.entries(state?.practice ?? {})) {
    if (!p) continue;
    const pick = typeof p.option === "string" && /^[A-F]$/.test(p.option) ? p.option : null;
    const at = iso(p.updatedAt) ?? new Date(0).toISOString();
    const prev = rows[key];
    rows[key] = {
      ...prev,
      pick,
      result: ["correct", "wrong", "unreviewed"].includes(p.result) ? p.result : null,
      attempted_at: iso(p.submittedAt),
      updated_at: prev && prev.updated_at > at ? prev.updated_at : at,
    };
  }
  return rows;
}

/** A remote row written into a Sem 4 state, in place. `idOf` maps a Desk key back to its practice id. */
export function applyToSem4(state, key, row, idOf) {
  if (key.startsWith("topic:")) {
    const [course, rest] = key.slice(6).split(":");
    const [unit, topic] = rest.split(".");
    const k = `${course}:${unit}:${topic}`;
    if (row.status && row.status !== "new") state.topics[k] = row.status;
    else delete state.topics[k];
  } else if (key.startsWith("video:")) {
    const id = key.slice(6);
    if (row.attempted_at) state.watched[id] = row.attempted_at;
    else delete state.watched[id];
  } else {
    const id = idOf(key);
    if (!id) return false;
    const n = row.pick ? LETTERS.indexOf(row.pick) : -1;
    state.practice[id] = { ...state.practice[id], pick: n >= 0 ? n : null, done: row.attempted_at || null, revise: !!row.flag };
  }
  return true;
}

/** A remote row written into a Sem 3 state, in place. */
export function applyToSem3(state, key, row) {
  const ms = Date.parse(row.updated_at) || Date.now();
  state.items[`q/${key}`] = { status: row.status ?? "new", flag: !!row.flag, note: row.note ?? "", updatedAt: ms };
  if (row.pick || row.attempted_at || row.result) {
    state.practice[key] = {
      ...state.practice[key],
      option: row.pick ?? "",
      result: row.result ?? "unreviewed",
      submittedAt: row.attempted_at ? Date.parse(row.attempted_at) : 0,
      updatedAt: ms,
    };
  }
  return true;
}

/**
 * What to do with one semester's rows: `push` the Mac's changes, `pull` the
 * Desk's. `mac` and `remote` are `{ key: row }`; `snap` is `{ key: value }`
 * from the last run.
 */
export function plan(mac, remote, snap) {
  const push = [];
  const pull = [];
  for (const key of new Set([...Object.keys(mac), ...Object.keys(remote)])) {
    const m = mac[key];
    const r = remote[key];
    const mv = m ? rowValue(m) : null;
    const rv = r ? rowValue(r) : null;
    if (mv === rv) continue;
    const macMoved = mv !== (snap[key] ?? null);
    const remoteMoved = rv !== (snap[key] ?? null);
    if (macMoved && (!remoteMoved || !r || (m && m.updated_at >= r.updated_at))) {
      if (m) push.push({ item_key: key, ...m });
    } else if (r) pull.push({ item_key: key, ...r });
  }
  return { push, pull };
}
