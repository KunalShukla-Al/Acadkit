/**
 * A day at a glance, for what can't open the app: the iPhone's Shortcuts
 * (an alarm before the first class, Focus through class hours) and Siri.
 * It is built from the same rows and the same rules as the app's screens:
 * the Day Order calendar, the timetable, and attendance as the portal and
 * marked classes give it.
 *
 * Dates and times are IST wall-clock values the caller passes in: the edge
 * runtime's clock is UTC, and between midnight and 5:30 IST its "today" is
 * still yesterday.
 */
import { computeSubjectAttendance, snapshotsByCode } from "./attendance.ts";
import { getDayInfo, nextWorkingDate, semesterWindow, type DayKind } from "./calendar.ts";
import { diffDays, formatTime, istParts, stillAhead, timeToMinutes } from "./dates.ts";
import { subjectShort, testTitle } from "./subjectShort.ts";
import type { AttendanceRecord, Deadline, PortalSnapshot, Settings, Subject, TimetableSlot } from "./types.ts";

export interface TodayClass {
  /** "HH:MM", IST. */
  start: string;
  end: string;
  code: string;
  name: string;
  short: string;
  room: string | null;
  type: "theory" | "lab";
  /** Attendance so far, one decimal; null before any class has counted. */
  attendance: number | null;
  /** Classes of this subject you can still miss and stay at its bar. */
  canSkip: number;
  /** No class of it to spare: missing this one puts you below the bar, or deeper under it. */
  mustAttend: boolean;
}

export interface TodayTest {
  title: string;
  /** The title with its subject in front when it doesn't name it ("TBVP End-sem"), to say aloud. */
  name: string;
  code: string | null;
  type: Deadline["type"];
  /** The notice Autopilot added it from, by file name; null for one you added. */
  from: string | null;
  /** The deadline's own timestamp. */
  due: string;
  /** Whole days from today, 0 = today. */
  inDays: number;
}

export interface Today {
  date: string;
  kind: DayKind;
  dayOrder: number | null;
  holiday: string | null;
  classes: TodayClass[];
  /** First start and last end, "HH:MM"; null with no classes. */
  first: string | null;
  last: string | null;
  /** When to wake: `lead` minutes before the first class. */
  alarm: string | null;
  /** The next day with classes, when today has none. */
  next: { date: string; dayOrder: number } | null;
  /** Tests and deadlines still to do in the next seven days, soonest first; with `time`, one already past today has gone. */
  tests: TodayTest[];
  /** The day in one sentence, for a notification or Siri. */
  say: string;
  /** Only with `time`: until when Focus should hold, the last class's end while one is still ahead; null once they are over. */
  focusUntil: string | null;
  /** Only with `time`: the day from where you stand, for arriving on campus: the class on now, or the next one. */
  arrive: string;
  /** Only with `time`: what leaving campus now would miss, as a question ("Mark the rest absent? …"); null with nothing left. */
  leave: string | null;
}

export interface TodayInput {
  /** IST date, "YYYY-MM-DD". */
  date: string;
  settings: Pick<Settings, "sem_start" | "sem_end" | "declared_holidays"> | null;
  subjects: Subject[];
  slots: TimetableSlot[];
  attendance: AttendanceRecord[];
  snapshots: PortalSnapshot[];
  deadlines: Deadline[];
  /** Minutes between the alarm and the first class. */
  lead?: number;
  /** IST "HH:MM", when the answer is for a moment in the day (arriving on campus). */
  time?: string;
}

const norm = (code: string) => code.replace(/\s/g, "").toUpperCase();
const hhmm = (time: string) => time.slice(0, 5);

function minutesToHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "Day Order 3: 4 classes from 8:00 AM, the first OS in TP301. Don't miss DSA." */
function sentence(t: Omit<Today, "say" | "focusUntil" | "arrive" | "leave">): string {
  const parts: string[] = [];
  if (t.classes.length === 0) {
    const why = t.holiday ? `No classes today: ${t.holiday}.` : "No classes today.";
    parts.push(t.next ? `${why} Next is Day Order ${t.next.dayOrder} on ${weekday(t.next.date)}.` : why);
  } else {
    const first = t.classes[0];
    const n = t.classes.length;
    parts.push(
      `Day Order ${t.dayOrder}: ${n} class${n === 1 ? "" : "es"} from ${formatTime(first.start)}, the first ${first.short}${first.room ? ` in ${first.room}` : ""}.`
    );
    const must = [...new Set(t.classes.filter((c) => c.mustAttend).map((c) => c.short))];
    if (must.length) parts.push(`Don't miss ${list(must)}.`);
  }
  const soon = t.tests.find((x) => x.inDays <= 1);
  if (soon) parts.push(`${soon.name} is ${soon.inDays === 0 ? "today" : "tomorrow"}.`);
  return parts.join(" ");
}

function weekday(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "long" });
}

function list(items: string[]): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "Day Order 3. Now: OS in TP301, until 8:50 AM. Last class ends at 12:50 PM." */
function arrival(t: Omit<Today, "say" | "focusUntil" | "arrive" | "leave">, time: string | undefined): string {
  if (!t.classes.length || time === undefined) return sentence(t);
  const now = timeToMinutes(time);
  const on = t.classes.find((c) => timeToMinutes(c.start) <= now && now < timeToMinutes(c.end));
  const next = t.classes.find((c) => timeToMinutes(c.start) > now);
  const room = (c: TodayClass) => (c.room ? ` in ${c.room}` : "");
  if (!on && !next) return `Day Order ${t.dayOrder}. Classes are over for today.`;
  const parts = [`Day Order ${t.dayOrder}.`];
  if (on) parts.push(`Now: ${on.short}${room(on)}, until ${formatTime(on.end)}.`);
  else if (next) parts.push(`Next: ${next.short}${room(next)} at ${formatTime(next.start)}.`);
  parts.push(`Last class ends at ${formatTime(t.last!)}.`);
  return parts.join(" ");
}

export function today({ date, settings, subjects, slots, attendance, snapshots, deadlines, lead = 60, time }: TodayInput): Today {
  const window = semesterWindow(settings);
  const declared = settings?.declared_holidays ?? [];
  const info = getDayInfo(date, declared, window);
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const portal = snapshotsByCode(snapshots);

  const standing = new Map(
    subjects.map((s) => {
      const records = attendance.filter((r) => r.subject_id === s.id);
      return [s.id, computeSubjectAttendance(s, records, portal.get(norm(s.code)))];
    })
  );

  const classes: TodayClass[] = info.dayOrder === null
    ? []
    : slots
        .filter((slot) => slot.day_order === info.dayOrder && byId.has(slot.subject_id))
        .sort((a, b) => a.start_time.localeCompare(b.start_time))
        .map((slot) => {
          const s = byId.get(slot.subject_id)!;
          const a = standing.get(s.id)!;
          return {
            start: hhmm(slot.start_time),
            end: hhmm(slot.end_time),
            code: s.code,
            name: s.name,
            short: subjectShort(s),
            room: slot.room,
            type: slot.slot_type ?? s.type,
            attendance: a.percentage === null ? null : Math.round(a.percentage * 10) / 10,
            canSkip: a.canBunk,
            mustAttend: a.total > 0 && a.canBunk === 0,
          };
        });

  const first = classes[0]?.start ?? null;
  const ends = classes.map((c) => c.end).sort();
  const last = ends.length ? ends[ends.length - 1] : null;
  const next = classes.length ? null : nextWorkingDate(date, declared, window);

  const tests = deadlines
    .filter((d) => d.status === "pending" && stillAhead(d.due_date, date, time))
    .map((d) => ({ d, day: istParts(d.due_date).date }))
    .filter(({ day }) => diffDays(date, day) <= 7)
    .sort((a, b) => a.d.due_date.localeCompare(b.d.due_date))
    .map(({ d, day }) => ({
      title: d.title,
      name: testTitle(d.title, d.subject_id ? byId.get(d.subject_id) : undefined),
      code: d.subject_id ? (byId.get(d.subject_id)?.code ?? null) : null,
      type: d.type,
      // Autopilot keeps the notice's path in `source` (scripts/lib/autopilot-notice.mjs).
      from: d.source ? d.source.slice(d.source.lastIndexOf("/") + 1) : null,
      due: d.due_date,
      inDays: diffDays(date, day),
    }));

  const t: Omit<Today, "say" | "focusUntil" | "arrive" | "leave"> = {
    date,
    kind: info.kind,
    dayOrder: info.dayOrder,
    holiday: info.holidayName ?? null,
    classes,
    first,
    last,
    alarm: first === null ? null : minutesToHHMM(timeToMinutes(first) - lead),
    next: next?.dayOrder ? { date: next.date, dayOrder: next.dayOrder } : null,
    tests,
  };
  const ahead = time !== undefined && last !== null && timeToMinutes(time) < timeToMinutes(last);
  const rest = time === undefined ? [] : classes.filter((c) => timeToMinutes(c.start) > timeToMinutes(time));
  const leave = rest.length ? `Mark the rest absent? ${list(rest.map((c) => `${c.short} at ${formatTime(c.start)}`))}.` : null;
  return { ...t, say: sentence(t), focusUntil: ahead ? last : null, arrive: arrival(t, time), leave };
}
