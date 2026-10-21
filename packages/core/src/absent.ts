/**
 * "I'm absent in OS", worked out: which classes that means (the subject's,
 * or the day's, on the Day Order calendar, the lab's or theory's when said),
 * what each was marked before, and the sentence to say back. The feeds write
 * the rows and keep the before states, so the app can undo it exactly
 * (migration 051).
 */
import type { AskAccount, Clock } from "./answer.ts";
import type { Ask } from "./ask.ts";
import { getDayInfo, semesterWindow } from "./calendar.ts";
import { addDays } from "./dates.ts";
import { subjectShort } from "./subjectShort.ts";
import type { AttendanceStatus } from "./types.ts";

export interface AbsentRow {
  subject_id: string;
  date: string;
  start_time: string;
  end_time: string;
  /** What the class was marked as before, or null when it wasn't. */
  before: { status: AttendanceStatus; auto_marked: boolean } | null;
}

const plural = (n: number, one: string, many = `${one}es`) => `${n} ${n === 1 ? one : many}`;

/**
 * `after` ("HH:MM"): only classes starting after it, for leaving campus early
 * ("Mark the rest absent?").
 */
export function absentRows(ask: Ask, account: AskAccount, clock: Clock, { after }: { after?: string } = {}): { rows: AbsentRow[]; say: string } {
  const date = addDays(clock.date, ask.day);
  const when = ask.day === -1 ? "yesterday" : "today";
  const info = getDayInfo(date, account.settings?.declared_holidays ?? [], semesterWindow(account.settings));
  const subject = ask.subject ? (account.subjects.find((s) => s.code === ask.subject) ?? null) : null;
  const what = subject ? `${subjectShort(subject)}${ask.session ? ` ${ask.session}` : ""}` : null;
  if (info.dayOrder === null)
    return { rows: [], say: `There ${ask.day === -1 ? "were" : "are"} no classes ${when}${info.holidayName ? `: ${info.holidayName}` : ""}.` };

  const byId = new Map(account.subjects.map((s) => [s.id, s]));
  const slots = account.slots
    .filter((s) => s.day_order === info.dayOrder && byId.has(s.subject_id))
    .filter((s) => !subject || s.subject_id === subject.id)
    .filter((s) => !ask.session || (s.slot_type ?? byId.get(s.subject_id)!.type) === ask.session)
    .filter((s) => after === undefined || s.start_time.slice(0, 5) > after)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  if (!slots.length)
    return { rows: [], say: after !== undefined ? "No classes left today." : what ? `You have no ${what} class ${when}.` : `You have no classes ${when}.` };

  const rows = slots.map((s) => {
    const had = account.attendance.find((r) => r.subject_id === s.subject_id && r.date === date && r.start_time === s.start_time);
    return {
      subject_id: s.subject_id,
      date,
      start_time: s.start_time,
      end_time: s.end_time,
      before: had ? { status: had.status, auto_marked: !!had.auto_marked } : null,
    };
  });
  // Already absent by hand: nothing to write, or to undo.
  const changing = rows.filter((r) => !(r.before?.status === "absent" && !r.before.auto_marked));
  if (!changing.length) return { rows: [], say: `You're already marked absent${what ? ` in ${what}` : ""} ${when}.` };
  const count = plural(changing.length, after !== undefined ? "class left" : "class", after !== undefined ? "classes left" : undefined);
  return {
    rows: changing,
    say: `Marked you absent ${what ? `in ${what}: ${count}` : `for ${count}`} ${when}. You can undo it in the app.`,
  };
}
