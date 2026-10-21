import { describe, expect, it } from "vitest";
import { absentRows } from "./absent.ts";
import type { AskAccount } from "./answer.ts";
import { parseAsk } from "./ask.ts";
import type { Subject } from "./types.ts";

const subject = (id: string, code: string, name: string, short_name: string): Subject => ({
  id, device_id: "1234", code, name, short_name, credits: 4, type: "theory", faculty: null, color_hex: "#000",
});
const OS = subject("os", "21CSC202J", "Operating Systems", "OS");
const DSA = subject("dsa", "21CSC201J", "Data Structures and Algorithms", "DSA");
const slot = (subject_id: string, start: string, end: string, slot_type: "theory" | "lab" = "theory") => ({
  id: `${subject_id}-${start}`, device_id: "1234", subject_id, day_order: 3, start_time: `${start}:00`, end_time: `${end}:00`, room: null, slot_type,
});
const account = (attendance: AskAccount["attendance"] = []): AskAccount => ({
  settings: { id: "s", device_id: "1234", semester: 3, target_sgpa: 8.5, min_attendance: 75, sem_start: "2026-07-21", sem_end: "2026-11-18", declared_holidays: [], current_day_order: 1 },
  subjects: [OS, DSA],
  slots: [slot("os", "08:00", "08:50"), slot("os", "08:50", "09:40"), slot("dsa", "10:00", "11:40", "lab"), slot("dsa", "12:00", "12:50")],
  attendance,
  snapshots: [],
  deadlines: [],
  marks: [],
});
// Wednesday 7 Oct is Day Order 3; Thursday 8th is 4.
const at = (q: string, acct = account(), date = "2026-10-07") => absentRows(parseAsk(q, acct.subjects), acct, { date, time: "09:00" });

describe("absentRows", () => {
  it("takes the subject's classes that day, and only its lab when said", () => {
    const os = at("I'm absent in OS");
    expect(os.rows.map((r) => r.start_time)).toEqual(["08:00:00", "08:50:00"]);
    expect(os.say).toBe("Marked you absent in OS: 2 classes today. You can undo it in the app.");
    expect(at("absent in DSA lab").rows.map((r) => r.start_time)).toEqual(["10:00:00"]);
    expect(at("mark me absent").rows).toHaveLength(4);
    expect(at("mark me absent").say).toBe("Marked you absent for 4 classes today. You can undo it in the app.");
  });

  it("keeps what each class was marked before, and skips what is absent already", () => {
    const before = account([
      { id: "1", device_id: "1234", subject_id: "os", date: "2026-10-07", start_time: "08:00:00", end_time: "08:50:00", status: "present", auto_marked: true },
      { id: "2", device_id: "1234", subject_id: "os", date: "2026-10-07", start_time: "08:50:00", end_time: "09:40:00", status: "absent", auto_marked: false },
    ]);
    const r = at("I'm absent in OS", before);
    expect(r.rows).toEqual([{ subject_id: "os", date: "2026-10-07", start_time: "08:00:00", end_time: "08:50:00", before: { status: "present", auto_marked: true } }]);
    expect(r.say).toBe("Marked you absent in OS: 1 class today. You can undo it in the app.");
    const all = account(before.attendance.map((x) => ({ ...x, status: "absent" as const, auto_marked: false })));
    expect(at("I'm absent in OS", all)).toEqual({ rows: [], say: "You're already marked absent in OS today." });
  });

  it("says when there's nothing to mark", () => {
    expect(at("I'm absent in OS", account(), "2026-10-02").say).toBe("There are no classes today: Gandhi Jayanthi.");
    expect(at("I was absent in DSA yesterday", account(), "2026-10-08").rows.map((r) => r.date)).toEqual(["2026-10-07", "2026-10-07"]);
    expect(at("absent in OS", account(), "2026-10-08").say).toBe("You have no OS class today.");
  });
});
