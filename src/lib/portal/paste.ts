import { diagnose, scrapeAttendance, tablesIn, type PortalAttendanceRow } from "@/lib/portal/parse";
import { deviceKind } from "@/lib/reading";

/** What the empty paste box says: a phone pastes from a tap's menu, a computer from a click and the keyboard. */
export function pasteHint(): string {
  return deviceKind() === "phone" ? "Tap here, then paste" : "Click here, then paste";
}

/** The portal's attendance page, read from a paste. Marks and the timetable are typed in: they change a row at a time. */
export interface PastedPortal {
  attendance: PortalAttendanceRow[];
  /** Tables found in the pasted markup, whether or not any parsed. */
  tablesSeen: number;
  /**
   * A dump of what was actually there, set only when nothing parsed.
   * "Found nothing" is a dead end; naming the containers that *were*
   * present is how the parser gets taught a page it doesn't know.
   */
  diagnostic: string | null;
}

/** True when the clipboard gave us markup rather than flattened text. */
export function looksLikeHtml(input: string): boolean {
  return /<\s*(table|tr|td|div|span|body|html)\b/i.test(input);
}

export function parsePastedPortal(html: string): PastedPortal {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = tablesIn([doc]);
  const attendance = scrapeAttendance(tables);
  return {
    attendance,
    tablesSeen: tables.length,
    diagnostic: attendance.length
      ? null
      : diagnose([doc], tables, { url: "pasted", hash: "", title: doc.title || "", documents: 1, blockedFrames: 0 }),
  };
}
