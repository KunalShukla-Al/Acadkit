/**
 * One spoken sentence for each question the Siri grammar hears (ask.ts),
 * from the same rules as the app's screens and in their words ("classes
 * to spare", "the bar", "attend 8 in a row to get back"): attendance and
 * its bar, the marks plan for a grade, the deadlines list, and the day's
 * classes.
 * Marking absent is a write, so the feeds do it and say what they did
 * (supabase/functions/feeds); this answers the questions that only read.
 */
import type { Ask } from "./ask.ts";
import { computeSubjectAttendance, snapshotsByCode, type SubjectAttendance } from "./attendance.ts";
import { diffDays, formatTime, istParts, stillAhead } from "./dates.ts";
import { gradeForTargetSgpa, solveSubjectPlan } from "./plan.ts";
import { subjectShort, testTitle } from "./subjectShort.ts";
import { today } from "./today.ts";
import type { AttendanceRecord, Deadline, Mark, PortalSnapshot, Settings, Subject, TimetableSlot } from "./types.ts";

export interface AskAccount {
  settings: Settings | null;
  subjects: Subject[];
  slots: TimetableSlot[];
  attendance: AttendanceRecord[];
  snapshots: PortalSnapshot[];
  deadlines: Deadline[];
  marks: Mark[];
}

/** IST: the date, and the time as "HH:MM". */
export interface Clock {
  date: string;
  time: string;
}

export const HELP = "I can tell you if you can skip a class, what you need in a subject, when your next test is, or mark you absent.";

const norm = (code: string) => code.replace(/\s/g, "").toUpperCase();
const pct = (n: number) => `${Math.round(n)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function standing(subject: Subject, account: AskAccount): SubjectAttendance {
  const records = account.attendance.filter((r) => r.subject_id === subject.id);
  return computeSubjectAttendance(subject, records, snapshotsByCode(account.snapshots).get(norm(subject.code)));
}

/** Past the semester's last teaching day there's nothing left to skip, only where you finished. */
const classesOver = (account: AskAccount, clock: Clock) => !!account.settings?.sem_end && clock.date > account.settings.sem_end;

function skipOne(subject: Subject, account: AskAccount, clock: Clock): string {
  const a = standing(subject, account);
  const short = subjectShort(subject);
  if (a.total === 0 || a.percentage === null) return `No ${short} classes have counted yet.`;
  if (classesOver(account, clock)) return `${short}'s classes are over: you finished at ${pct(a.percentage)}, and the bar is ${a.min}%.`;
  if (a.canBunk > 0) return `Yes. ${short} has ${plural(a.canBunk, "class", "classes")} to spare: you're at ${pct(a.percentage)}, and the bar is ${a.min}%.`;
  if (a.percentage >= a.min) return `Better not. ${short} has no classes to spare: you're at ${pct(a.percentage)}, one absence from the bar of ${a.min}%.`;
  return `No. You're at ${pct(a.percentage)} in ${short}, under the bar of ${a.min}%. Attend ${a.needToAttend} in a row to get back.`;
}

function skipToday(account: AskAccount, clock: Clock): string {
  const day = today({ date: clock.date, ...account });
  const codes = [...new Set(day.classes.map((c) => c.code))];
  if (classesOver(account, clock)) return "Classes are over for the semester. Ask about a subject to hear where you finished.";
  if (!codes.length) return `${day.holiday ? `No classes today: ${day.holiday}.` : "No classes today."} Ask about a subject to hear how many you can skip.`;
  const parts = codes.map((code) => {
    const c = day.classes.find((x) => x.code === code)!;
    return `${c.short}, ${c.mustAttend ? "none to spare" : `${c.canSkip} to spare`}`;
  });
  return `Today: ${parts.join("; ")}.`;
}

function need(subject: Subject, ask: Ask, account: AskAccount, clock: Clock): string {
  const short = subjectShort(subject);
  const grade = ask.grade ?? subject.target_grade ?? gradeForTargetSgpa(account.settings?.target_sgpa ?? 8.5);
  const plan = solveSubjectPlan(subject, account.marks.filter((m) => m.subject_id === subject.id), grade, {
    deadlines: account.deadlines.filter((d) => d.subject_id === subject.id),
    today: clock.date,
    assumedExternalPct: account.settings?.assumed_external_pct ?? null,
  });
  const g = `${/^[AO]/.test(grade) ? "an" : "a"} ${grade.replace("+", " plus")}`;
  if (plan.status === "final") return `${short} is done: you finished on ${Math.round(plan.banked)}, ${plan.floorGrade.replace("+", " plus")}.`;
  if (plan.status === "locked") return `You have ${g} in ${short} already: it holds even if you score nothing from here.`;
  if (plan.status === "out-of-reach")
    return `${g[0].toUpperCase()}${g.slice(1)} in ${short} is out of reach: full marks from here gives ${Math.round(plan.ceiling)}. The best you can still get is ${(plan.bestReachable ?? "F").replace("+", " plus")}.`;
  const share = plan.requiredRate === null ? "" : `${pct(plan.requiredRate * 100)} of what's left`;
  const next = plan.next ?? plan.components.find((c) => c.required !== null);
  const need = next && next.required !== null ? Math.ceil(next.required * 2) / 2 : null;
  // The internals no test has claimed yet aren't a test to name; a test already sat is waiting on its marks.
  const step =
    !next || need === null
      ? ""
      : next.kind === "unannounced"
        ? `, starting with ${need} of the ${Math.round(next.max)} internal marks not announced yet`
        : `, starting with ${need} of ${next.max} in ${next.label}${next.date && next.date < clock.date ? `, sat ${when(next.date, clock)} and waiting on its marks` : next.date ? ` ${when(next.date, clock)}` : ""}`;
  return `For ${g} in ${short}, you need ${share || `${Math.ceil(plan.needed)} more marks`}${step}.`;
}

/** "today", "tomorrow", "on Thursday, 29 October". */
function when(date: string, clock: Clock): string {
  const n = diffDays(clock.date, date);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  return `on ${day}`;
}

function nextTest(subject: Subject | null, account: AskAccount, clock: Clock): string {
  const byId = new Map(account.subjects.map((s) => [s.id, s]));
  // A test that started earlier today is under way or over, so the next one is next.
  const coming = account.deadlines
    .filter((d) => d.status === "pending" && d.type === "exam" && stillAhead(d.due_date, clock.date, clock.time))
    .filter((d) => !subject || d.subject_id === subject.id)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const t = coming[0];
  if (!t) return subject ? `No ${subjectShort(subject)} test is on your list.` : "No tests on your list.";
  const title = testTitle(t.title, t.subject_id ? byId.get(t.subject_id) : undefined);
  const due = istParts(t.due_date);
  const at = due.time === "00:00" ? "" : ` at ${formatTime(due.time)}`;
  const days = diffDays(clock.date, due.date);
  // Autopilot keeps the notice it read a test from (scripts/lib/autopilot-notice.mjs).
  const added = t.source ? " Autopilot added it from a notice." : "";
  return `${title} is ${when(due.date, clock)}${at}${days > 1 ? `, in ${days} days` : ""}.${added}`;
}

/** The answer to a question that only reads; "absent" is the feeds' to carry out. */
export function answer(ask: Ask, account: AskAccount, clock: Clock): string {
  const subject = ask.subject ? (account.subjects.find((s) => s.code === ask.subject) ?? null) : null;
  switch (ask.kind) {
    case "skip":
      return subject ? skipOne(subject, account, clock) : skipToday(account, clock);
    case "need":
      return subject ? need(subject, ask, account, clock) : "Which subject? Say, for example, what do I need in OS.";
    case "next-test":
      return nextTest(subject, account, clock);
    default:
      return HELP;
  }
}
