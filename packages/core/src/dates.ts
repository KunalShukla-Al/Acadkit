/** All app dates are local-time "YYYY-MM-DD" strings. */

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function isWeekend(iso: string): boolean {
  const dow = parseISODate(iso).getDay();
  return dow === 0 || dow === 6;
}

/** A timestamp's date and "HH:MM" in IST, where SRM's tests are set. */
export function istParts(iso: string): { date: string; time: string } {
  const at = new Date(iso);
  return {
    date: at.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
    time: at.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false }).slice(0, 5),
  };
}

/**
 * Whether a test or deadline is still ahead on an IST date, and at a time
 * when one is given. One set at midnight has a date but no time, so it
 * lasts its whole day.
 */
export function stillAhead(due: string, date: string, time?: string): boolean {
  const at = istParts(due);
  if (at.date !== date) return at.date > date;
  return time === undefined || at.time === "00:00" || at.time > time;
}

export function diffDays(fromISO: string, toISO: string): number {
  const ms = parseISODate(toISO).getTime() - parseISODate(fromISO).getTime();
  return Math.round(ms / 86_400_000);
}

export function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  return parseISODate(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...opts,
  });
}

export function formatDateLong(iso: string): string {
  return parseISODate(iso).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** "09:00:00" or "09:00" → "9:00 AM" */
export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

/** "9:00 AM – 9:50 AM" */
export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

/** "today" / "yesterday" / "3 days ago" for a YYYY-MM-DD date. */
export function relativeDay(iso: string, from: Date = new Date()): string {
  const days = Math.round(
    (parseISODate(toISODate(from)).getTime() - parseISODate(iso).getTime()) / 86_400_000
  );
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days <= 7) return `${days} days ago`;
  return `on ${formatDate(iso)}`;
}
