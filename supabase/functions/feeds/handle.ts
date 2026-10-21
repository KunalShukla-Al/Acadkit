/**
 * The feeds, as a plain request handler: what reads AcadKit with a private
 * token instead of a session (migration 047). Its database and clock are
 * passed in (index.ts), so the same code runs under Vitest.
 *
 *   GET /feeds/today?token=…          the day at a glance (packages/core/src/today.ts)
 *   GET /feeds/calendar.ics?token=…   classes, tests and deadlines, to subscribe to as
 *                                     webcal://…/feeds/calendar.ics?token=…
 *   POST /feeds/share?token=…&name=…  a file for the study folder (the share sheet): the
 *                                     body is its bytes; it lands in Inbox/ (or &folder=…)
 *   GET /feeds/ask?token=…&q=…        Siri: the question as said, answered in one sentence
 *                                     (packages/core/src/ask.ts, answer.ts)
 *   POST /feeds/leave?token=…         leaving campus early: the classes still to come today,
 *                                     marked absent (asked first, by the AcadKit Leave Shortcut)
 *
 * The token may also come as "Authorization: Bearer …".
 */
import { absentRows, type AbsentRow } from "../../../packages/core/src/absent.ts";
import { answer } from "../../../packages/core/src/answer.ts";
import { parseAsk } from "../../../packages/core/src/ask.ts";
import { buildEffectiveMap, semesterWindow } from "../../../packages/core/src/calendar.ts";
import { addDays } from "../../../packages/core/src/dates.ts";
import { buildIcs } from "../../../packages/core/src/ics.ts";
import { today } from "../../../packages/core/src/today.ts";
import { MAX_UPLOAD_BYTES, safeUploadName, withExtension } from "../../../packages/core/src/uploads.ts";
import type { AttendanceRecord, Deadline, Mark, PortalSnapshot, Settings, Subject, TimetableSlot } from "../../../packages/core/src/types.ts";

export interface Account {
  settings: Settings | null;
  subjects: Subject[];
  slots: TimetableSlot[];
  attendance: AttendanceRecord[];
  snapshots: PortalSnapshot[];
  deadlines: Deadline[];
  marks: Mark[];
}

/** A file on its way to the study folder: the bytes go to `key` in the inbox, and a study_uploads row says where they land (migration 033). */
export interface Shared {
  key: string;
  path: string;
  type: string;
  bytes: Uint8Array;
}

export interface FeedDeps {
  /** The PIN a token belongs to and whether this call is inside its limit (feed_use, migration 052), or null for a token that isn't one. */
  use(token: string): Promise<{ pin: string; allowed: boolean } | null>;
  load(pin: string): Promise<Account>;
  share(pin: string, file: Shared): Promise<void>;
  /** Mark the rows absent, and keep them with what was said for the app's Undo (migration 051). */
  markAbsent(pin: string, said: string, rows: AbsentRow[]): Promise<void>;
  now(): Date;
  /** A fresh id for an inbox folder. */
  uuid?(): string;
}

const TOKEN = /^[0-9a-f]{48}$/;
const ROUTES = new Set(["today", "calendar.ics", "share", "ask", "leave"]);
/** The routes that write, and so take POST. */
const WRITES = new Set(["share", "leave"]);
/** Where shared files land unless the Shortcut names a folder. */
const SHARE_FOLDER = "Inbox";
/** The calendar's span: last week, for what just happened, to two months ahead. */
const PAST_DAYS = 7;
const AHEAD_DAYS = 60;
const IST = "Asia/Kolkata";

/** The IST calendar date of an instant, "YYYY-MM-DD". */
export function istDate(at: Date): string {
  return at.toLocaleDateString("en-CA", { timeZone: IST });
}

/** The IST wall-clock time of an instant, "HH:MM". */
export function istTime(at: Date): string {
  return at.toLocaleTimeString("en-GB", { timeZone: IST, hour12: false }).slice(0, 5);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function tokenOf(req: Request, url: URL): string {
  return url.searchParams.get("token") ?? (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
}

/** A folder path for a shared file: relative, each part named as the sync will keep it. */
export function shareFolder(raw: string | null): string {
  const parts = (raw ?? "").split("/").map((p) => p.trim()).filter((p) => p && p !== "." && p !== "..");
  return parts.length ? parts.map(safeUploadName).join("/") : SHARE_FOLDER;
}

export async function handle(req: Request, deps: FeedDeps): Promise<Response> {
  const url = new URL(req.url);
  const route = url.pathname.split("/").pop() ?? "";
  if (!ROUTES.has(route)) return json({ error: "no such feed" }, 404);
  const writes = WRITES.has(route);
  if (writes ? req.method !== "POST" : req.method !== "GET" && req.method !== "HEAD") return json({ error: writes ? "POST only" : "GET only" }, 405);

  // A malformed token and an unknown one get the same answer.
  const token = tokenOf(req, url);
  const use = TOKEN.test(token) ? await deps.use(token) : null;
  if (!use) return json({ error: "unknown token" }, 401);
  if (!use.allowed) return new Response(JSON.stringify({ error: "too many requests, try again in a minute" }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } });
  const pin = use.pin;

  if (route === "share") {
    const name = url.searchParams.get("name");
    if (!name?.trim()) return json({ error: "name the file: &name=…" }, 400);
    const declared = Number(req.headers.get("Content-Length") ?? 0);
    if (declared > MAX_UPLOAD_BYTES) return json({ error: "over 50 MB" }, 413);
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length === 0) return json({ error: "empty file" }, 400);
    if (bytes.length > MAX_UPLOAD_BYTES) return json({ error: "over 50 MB" }, 413);
    const file = safeUploadName(withExtension(name, req.headers.get("Content-Type")));
    const path = `${shareFolder(url.searchParams.get("folder"))}/${file}`;
    const key = `${pin}/inbox/${(deps.uuid ?? (() => crypto.randomUUID()))()}/${file}`;
    await deps.share(pin, { key, path, type: req.headers.get("Content-Type") || "application/octet-stream", bytes });
    return json({ path }, 201);
  }

  const account = await deps.load(pin);
  const now = deps.now();
  const date = istDate(now);
  if (route === "today") return json(today({ date, time: istTime(now), ...account }));
  if (route === "leave") {
    const time = istTime(now);
    const { rows, say } = absentRows({ kind: "absent", subject: null, day: 0, grade: null, session: null }, account, { date, time }, { after: time });
    if (rows.length) await deps.markAbsent(pin, `Left SRM at ${time}`, rows);
    return json({ say, marked: rows.length });
  }
  if (route === "ask") {
    const q = url.searchParams.get("q") ?? "";
    const asked = parseAsk(q, account.subjects);
    const clock = { date, time: istTime(now) };
    if (asked.kind !== "absent") return json({ kind: asked.kind, subject: asked.subject, say: answer(asked, account, clock) });
    const { rows, say } = absentRows(asked, account, clock);
    if (rows.length) await deps.markAbsent(pin, q.slice(0, 300), rows);
    return json({ kind: asked.kind, subject: asked.subject, say, marked: rows.length });
  }

  const effMap = buildEffectiveMap(account.settings?.declared_holidays ?? [], semesterWindow(account.settings));
  const ics = buildIcs({
    subjects: account.subjects,
    timetable: account.slots,
    effMap,
    from: addDays(date, -PAST_DAYS),
    to: addDays(date, AHEAD_DAYS),
    deadlines: account.deadlines,
    name: "AcadKit",
    refreshHours: 1,
  });
  return new Response(req.method === "HEAD" ? null : ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" },
  });
}
