import type { Deadline, Subject, TimetableSlot } from "./types.ts";

/** Timetable, tests and deadlines → iCalendar: the export in Settings and the feeds' webcal subscription. */

const TZID = "Asia/Kolkata";

/** Escape per RFC 5545: backslash, semicolon, comma, newline. */
function esc(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545 caps lines at 75 octets; continuations start with a space. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest) parts.push(" " + rest);
  return parts.join("\r\n");
}

/** "2026-09-03" + "09:00:00" → "20260903T090000" (floating, with TZID). */
function stamp(date: string, time: string): string {
  return `${date.replace(/-/g, "")}T${time.replace(/:/g, "").slice(0, 6)}`;
}

/**
 * A stable, filename-safe UID. Same class, same UID, across exports -
 * so re-importing updates rather than duplicates.
 */
function uid(subjectId: string, date: string, start: string): string {
  return `${subjectId}-${date}-${start.replace(/:/g, "")}@acadkit`.replace(
    /[^A-Za-z0-9@.-]/g,
    ""
  );
}

/** An instant as UTC: "2026-10-29T09:00:00+05:30" → "20261029T033000Z". */
function utc(iso: string, plusMinutes = 0): string {
  return new Date(new Date(iso).getTime() + plusMinutes * 60_000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** How long a deadline shows for: a test takes an hour; anything else is a moment to hand in by. */
const DEADLINE_MINUTES: Record<Deadline["type"], number> = { exam: 60, assignment: 15, lab: 15, other: 15 };

export interface IcsOptions {
  subjects: Subject[];
  timetable: TimetableSlot[];
  /** Effective date → day order, declared holidays already removed. */
  effMap: Record<string, number>;
  /** Only emit classes on/after this date; defaults to the whole map. */
  from?: string;
  /** Nor after this one. */
  to?: string;
  /** Tests and deadlines still to do, each at its due time. */
  deadlines?: Deadline[];
  /** The calendar's name in the Calendar app. */
  name?: string;
  /** A subscription: tells the calendar app how often to fetch it again. */
  refreshHours?: number;
}

export function buildIcs({ subjects, timetable, effMap, from, to, deadlines = [], name = "AcadKit Timetable", refreshHours }: IcsOptions): string {
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const slotsByDayOrder = new Map<number, TimetableSlot[]>();
  for (const slot of timetable) {
    const list = slotsByDayOrder.get(slot.day_order) ?? [];
    list.push(slot);
    slotsByDayOrder.set(slot.day_order, list);
  }

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AcadKit//Timetable//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${esc(name)}`),
    `X-WR-TIMEZONE:${TZID}`,
    ...(refreshHours ? [`REFRESH-INTERVAL;VALUE=DURATION:PT${refreshHours}H`, `X-PUBLISHED-TTL:PT${refreshHours}H`] : []),
  ];

  const dates = Object.keys(effMap)
    .filter((d) => (!from || d >= from) && (!to || d <= to))
    .sort();

  for (const date of dates) {
    const slots = [...(slotsByDayOrder.get(effMap[date]) ?? [])].sort((a, b) =>
      a.start_time.localeCompare(b.start_time)
    );
    for (const slot of slots) {
      const subject = byId.get(slot.subject_id);
      if (!subject) continue;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid(slot.subject_id, date, slot.start_time)}`,
        `DTSTART;TZID=${TZID}:${stamp(date, slot.start_time)}`,
        `DTEND;TZID=${TZID}:${stamp(date, slot.end_time)}`,
        fold(`SUMMARY:${esc(subject.name)}`),
        fold(`DESCRIPTION:${esc(`${subject.code} · Day Order ${effMap[date]}`)}`),
        ...(slot.room ? [fold(`LOCATION:${esc(slot.room)}`)] : []),
        "END:VEVENT"
      );
    }
  }

  for (const d of deadlines) {
    if (d.status !== "pending") continue;
    const subject = d.subject_id ? byId.get(d.subject_id) : undefined;
    lines.push(
      "BEGIN:VEVENT",
      `UID:deadline-${d.id.replace(/[^A-Za-z0-9-]/g, "")}@acadkit`,
      `DTSTART:${utc(d.due_date)}`,
      `DTEND:${utc(d.due_date, DEADLINE_MINUTES[d.type])}`,
      fold(`SUMMARY:${esc(d.title)}`),
      fold(`DESCRIPTION:${esc([subject?.name, d.type === "exam" ? "Test" : "Due", d.max_marks ? `${d.max_marks} marks` : null].filter(Boolean).join(" · "))}`),
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  // RFC 5545 wants CRLF and a trailing break.
  return lines.join("\r\n") + "\r\n";
}

/** Number of VEVENTs in a calendar - used to report what was exported. */
export function countEvents(ics: string): number {
  return (ics.match(/BEGIN:VEVENT/g) ?? []).length;
}
