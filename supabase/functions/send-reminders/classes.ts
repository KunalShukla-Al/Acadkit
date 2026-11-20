/**
 * A day's classes, and whether each one can be skipped, for send-reminders.
 * No Deno or npm imports, so Vitest can load it.
 *
 * The calendar and the short names mirror buildEffectiveMap and subjectShort in
 * packages/core, and classes.test.ts checks them against core's own. The attendance maths mirrors
 * computeSubjectAttendance (packages/core/src/attendance.ts) and the bunk
 * wallet's skip budget.
 */
import { OFFICIAL_HOLIDAYS } from "./calendar.generated.ts";

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isWeekend(iso: string): boolean {
  const day = new Date(iso + "T00:00:00Z").getUTCDay();
  return day === 0 || day === 6;
}

/** Day Order 1–5 across every weekday in the window that isn't an official holiday. */
function rotation(start: string, end: string): Record<string, number> {
  const map: Record<string, number> = {};
  let order = 1;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (isWeekend(d) || OFFICIAL_HOLIDAYS[d]) continue;
    map[d] = order;
    order = (order % 5) + 1;
  }
  return map;
}

/** A row of settings.declared_holidays: a holiday, or with day_order a class day. */
export interface DeclaredDay {
  date: string;
  day_order?: number | null;
  /** Cancels its own day order in place instead of shifting the rest forward. */
  cancels?: boolean | null;
}

/**
 * Date → day order, as the app reads it:
 * - a holiday (the default) drops out and shifts every later order forward;
 * - a cancelling holiday keeps its place, so the orders after it don't move;
 * - a class day follows its own order and shifts nothing.
 */
export function effectiveMap(declared: DeclaredDay[], start: string, end: string): Record<string, number> {
  const canonical = rotation(start, end);
  const classDay = (h: DeclaredDay) => h.day_order != null;
  const cancels = (h: DeclaredDay) => !classDay(h) && h.cancels === true;
  const shifting = new Set(declared.filter((h) => !classDay(h) && !cancels(h)).map((h) => h.date));
  const dates = Object.keys(canonical);
  const orders = dates.map((d) => canonical[d]);

  const map: Record<string, number> = {};
  dates.filter((d) => !shifting.has(d)).forEach((d, i) => (map[d] = orders[i]));
  for (const h of declared) if (cancels(h)) delete map[h.date];
  for (const h of declared) {
    if (classDay(h) && h.date >= start && h.date <= end) map[h.date] = h.day_order!;
  }
  return map;
}

export interface Slot {
  id: string;
  subject_id: string;
  day_order: number;
  start_time: string;
  room?: string | null;
}

export interface Mark {
  subject_id: string;
  date: string;
  start_time: string;
  status: string;
}

export interface Snapshot {
  conducted: number;
  absent: number;
  as_of: string;
}

/** What a subject's attendance is read from. */
export interface AttendanceData {
  slots: Slot[];
  marks: Mark[];
  /** The portal's count for the subject, when synced. */
  snapshot?: Snapshot;
  eff: Record<string, number>;
  semStart: string;
  semEnd: string;
}

export interface Standing {
  attended: number;
  held: number;
  /** Its classes from the moment asked about to the end of term, in order. */
  ahead: Array<{ date: string; start: string }>;
}

const hhmm = (t: string) => t.slice(0, 5);
const counted = (status: string) => status !== "holiday";
const wasThere = (status: string) => status === "present" || status === "od";

/**
 * Where a subject stands just before its class at `date` `start`: the marked
 * classes on top of the portal's count, every unmarked class before that
 * moment counted as attended (as auto-marking counts it, src/lib/autoMark.ts),
 * and the unmarked classes from that one on still ahead.
 */
export function standing(subjectId: string, r: AttendanceData, date: string, start: string): Standing {
  const mine = r.marks.filter((m) => m.subject_id === subjectId);
  const since = r.snapshot && r.snapshot.conducted > 0 ? r.snapshot.as_of : null;
  const rows = mine.filter((m) => counted(m.status) && (since === null || m.date > since));
  let attended = (since ? r.snapshot!.conducted - r.snapshot!.absent : 0) + rows.filter((m) => wasThere(m.status)).length;
  let held = (since ? r.snapshot!.conducted : 0) + rows.length;

  const marked = new Set(mine.map((m) => `${m.date}|${hhmm(m.start_time)}`));
  const slots = r.slots.filter((s) => s.subject_id === subjectId);
  const days = Object.keys(r.eff)
    .filter((d) => d >= r.semStart && d <= r.semEnd && (since === null || d > since))
    .sort();
  const ahead: Standing["ahead"] = [];
  for (const d of days) {
    for (const s of slots) {
      const t = hhmm(s.start_time);
      if (s.day_order !== r.eff[d] || marked.has(`${d}|${t}`)) continue;
      if (d < date || (d === date && t < start)) {
        attended++;
        held++;
      } else {
        ahead.push({ date: d, start: t });
      }
    }
  }
  ahead.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return { attended, held, ahead };
}

/** Today's classes with no attendance row yet, matched on subject and start time. */
export function unmarked(todaySlots: Slot[], marks: Mark[], date: string): number {
  const marked = new Set(marks.filter((m) => m.date === date).map((m) => `${m.subject_id}|${hhmm(m.start_time)}`));
  return todaySlots.filter((s) => !marked.has(`${s.subject_id}|${hhmm(s.start_time)}`)).length;
}

export interface Advice {
  /** Classes from here on that can be missed and still finish at or over the bar (the bunk wallet's number). */
  spare: number;
  pct: number | null;
  under: boolean;
  /** Under the bar: the day attending every class brings it back, null when too few are left. */
  backOn: string | null;
}

export function advise(st: Standing, bar: number): Advice {
  const { attended: a, held: h } = st;
  const left = st.ahead.length;
  const spare = Math.min(left, Math.max(0, Math.floor((100 * (a + left) - bar * (h + left)) / 100)));
  const pct = h > 0 ? (100 * a) / h : null;
  const under = pct !== null && pct < bar;
  const streak = under ? Math.ceil((bar * h - 100 * a) / (100 - bar)) : 0;
  return { spare, pct, under, backOn: under ? st.ahead[streak - 1]?.date ?? null : null };
}

const SMALL = new Set(["and", "of", "the", "for", "in", "to", "a", "an", "&"]);

/** A subject in a few letters, as the app's chips show it: subjectShort in packages/core/src/subjectShort.ts. */
export function short(subject: { name: string; short_name?: string | null }): string {
  const typed = subject.short_name?.trim();
  if (typed) return typed;
  const words = subject.name.trim().split(/[\s_-]+/).filter(Boolean);
  const big = words.filter((w) => !SMALL.has(w.toLowerCase()));
  if (big.length <= 1) return subject.name.trim();
  return big.map((w) => (/^[IVX]+$/.test(w) ? w : w[0].toUpperCase())).join("");
}

export function clock(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/** Why a subject under its bar has to be attended. */
function underLine(adv: Advice, bar: number): string {
  const at = `You're at ${Math.floor(adv.pct!)}%`;
  return adv.backOn
    ? `${at}. Attend every class and you're back over ${bar}% on ${day(adv.backOn)}.`
    : `${at}, and ${bar}% is out of reach this semester.`;
}

/** The reminder before one class: whether it can be skipped, and why. */
export function classMessage(
  label: string,
  slot: Pick<Slot, "start_time" | "room">,
  dayOrder: number,
  adv: Advice,
  bar: number
): { title: string; body: string } {
  const where = [clock(hhmm(slot.start_time)), `Day Order ${dayOrder}`, slot.room?.trim()].filter(Boolean).join(" · ");
  if (adv.spare >= 1) {
    const why =
      adv.spare === 1
        ? `It's your last one to spare: attend every ${label} class after it to stay over ${bar}%.`
        : `Skipping leaves ${adv.spare - 1} more to spare and keeps you over ${bar}%.`;
    return { title: `You can skip ${label}`, body: `${where}\n${why}` };
  }
  const why = adv.under ? underLine(adv, bar) : `None to spare: missing it takes you under ${bar}%.`;
  return { title: `Attend ${label}`, body: `${where}\n${why}` };
}

/** The morning's plan: the day order, and which of today's subjects can be skipped. */
export function dayMessage(
  dayOrder: number,
  first: string,
  count: number,
  subjects: Array<{ label: string; skippable: boolean }>
): { title: string; body: string } {
  const title = `Day Order ${dayOrder}: ${count} class${count === 1 ? "" : "es"}, first at ${clock(hhmm(first))}`;
  const skip = subjects.filter((s) => s.skippable).map((s) => s.label);
  const attend = subjects.filter((s) => !s.skippable).map((s) => s.label);
  const lines = [skip.length && `Can skip: ${skip.join(", ")}`, attend.length && `Attend: ${attend.join(", ")}`];
  return { title, body: lines.filter(Boolean).join("\n") };
}

/** The morning note for a subject under its bar. */
export function underMessage(label: string, adv: Advice, bar: number): { title: string; body: string } {
  return { title: `${label} is under ${bar}%`, body: underLine(adv, bar) };
}
