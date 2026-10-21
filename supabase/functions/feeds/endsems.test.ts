/**
 * The feeds with the clock moved through 21-30 November 2026: after the
 * semester's last teaching day (18 Nov), with the four end-sems on 25, 26,
 * 27 and 30 Nov at 2:00 PM. Each day is asked at 5:00 AM IST, when the alarm
 * Shortcut runs, and at 7:00 PM, after that day's paper.
 */
import { describe, expect, it } from "vitest";
import { handle, type Account } from "./handle.ts";

const TOKEN = "c".repeat(48);
const SUBJECTS = [
  ["tbvp", "21MAB201T", "Transforms & Boundary Value Problems"],
  ["fds", "21CSS202T", "Fundamentals of Data Science"],
  ["dsa", "21CSC201J", "Data Structures & Algorithms"],
  ["os", "21CSC202J", "Operating Systems"],
].map(([id, code, name]) => ({ id, device_id: "1234", code, name, credits: 4, type: "theory" as const, faculty: null, color_hex: "#000" }));
const slots = [1, 2, 3, 4, 5].map((d) => ({
  id: `s${d}`,
  device_id: "1234",
  subject_id: SUBJECTS[(d - 1) % 4].id,
  day_order: d,
  start_time: "08:00:00",
  end_time: "08:50:00",
  room: `R${d}`,
}));
const PAPERS = [["tbvp", "2026-11-25"], ["fds", "2026-11-26"], ["dsa", "2026-11-27"], ["os", "2026-11-30"]] as const;
const endSems = PAPERS.map(([subject, day]) => ({
  id: `end-${subject}`,
  device_id: "1234",
  subject_id: subject,
  title: "End-sem",
  type: "exam" as const,
  due_date: `${day}T14:00:00+05:30`,
  status: "pending" as const,
  priority: "high" as const,
}));
/** 34 of 40 OS classes attended in October: 85%. */
const attendance = Array.from({ length: 40 }, (_, i) => ({
  id: `a${i}`,
  device_id: "1234",
  subject_id: "os",
  date: `2026-10-${String(1 + (i % 28)).padStart(2, "0")}`,
  start_time: `${String(8 + Math.floor(i / 28)).padStart(2, "0")}:00:00`,
  end_time: `${String(8 + Math.floor(i / 28)).padStart(2, "0")}:50:00`,
  status: i < 34 ? ("present" as const) : ("absent" as const),
}));

const account: Account = {
  settings: { id: "s", device_id: "1234", semester: 3, target_sgpa: 8, min_attendance: 75, sem_start: "2026-07-21", sem_end: "2026-11-18", declared_holidays: [], current_day_order: 1 },
  subjects: SUBJECTS,
  slots,
  attendance,
  snapshots: [],
  deadlines: endSems,
  marks: [],
};

async function at(iso: string, feed: string, method = "GET") {
  let marked = 0;
  const res = await handle(new Request(`https://x/functions/v1/feeds/${feed}${feed.includes("?") ? "&" : "?"}token=${TOKEN}`, { method }), {
    use: async () => ({ pin: "1234", allowed: true }),
    load: async () => account,
    share: async () => {},
    markAbsent: async (_pin, _why, rows) => void (marked += rows.length),
    now: () => new Date(iso),
  });
  const body = feed.startsWith("calendar") ? await res.text() : await res.json();
  return { body, marked };
}

const ist = (day: string, time: string) => new Date(`2026-11-${day}T${time}:00+05:30`).toISOString();
const DAYS = ["21", "22", "23", "24", "25", "26", "27", "28", "29", "30"];
const ask = async (iso: string, q: string) => (await at(iso, `ask?q=${encodeURIComponent(q)}`)).body.say as string;

describe("the end-sems, 21-30 November", () => {
  it("has no classes, no alarm and nothing to leave on any day", async () => {
    for (const day of DAYS) {
      const { body: t } = await at(ist(day, "05:00"), "today");
      expect(t, day).toMatchObject({ kind: "post-semester", dayOrder: null, classes: [], alarm: null, focusUntil: null, leave: null, next: null });
      const left = await at(ist(day, "10:00"), "leave", "POST");
      expect([left.body.say, left.marked], day).toEqual(["There are no classes today.", 0]);
    }
  });

  it("says each morning's paper by its subject, and the next one once it's sat", async () => {
    const say = [];
    for (const day of DAYS) for (const time of ["05:00", "19:00"]) say.push(`${day} ${time} ${(await at(ist(day, time), "today")).body.say}`);
    expect(say).toEqual([
      "21 05:00 No classes today.",
      "21 19:00 No classes today.",
      "22 05:00 No classes today.",
      "22 19:00 No classes today.",
      "23 05:00 No classes today.",
      "23 19:00 No classes today.",
      "24 05:00 No classes today. TBVP End-sem is tomorrow.",
      "24 19:00 No classes today. TBVP End-sem is tomorrow.",
      "25 05:00 No classes today. TBVP End-sem is today.",
      "25 19:00 No classes today. FDS End-sem is tomorrow.",
      "26 05:00 No classes today. FDS End-sem is today.",
      "26 19:00 No classes today. DSA End-sem is tomorrow.",
      "27 05:00 No classes today. DSA End-sem is today.",
      "27 19:00 No classes today.",
      "28 05:00 No classes today.",
      "28 19:00 No classes today.",
      "29 05:00 No classes today. OS End-sem is tomorrow.",
      "29 19:00 No classes today. OS End-sem is tomorrow.",
      "30 05:00 No classes today. OS End-sem is today.",
      "30 19:00 No classes today.",
    ]);
  });

  it("counts the week's papers down, dropping each once it starts", async () => {
    const left = async (iso: string) => (await at(iso, "today")).body.tests.map((t: { code: string; inDays: number }) => `${t.code} ${t.inDays}`);
    expect(await left(ist("21", "05:00"))).toEqual(["21MAB201T 4", "21CSS202T 5", "21CSC201J 6"]);
    expect(await left(ist("25", "13:59"))).toEqual(["21MAB201T 0", "21CSS202T 1", "21CSC201J 2", "21CSC202J 5"]);
    expect(await left(ist("25", "14:00"))).toEqual(["21CSS202T 1", "21CSC201J 2", "21CSC202J 5"]);
    expect(await left(ist("30", "19:00"))).toEqual([]);
  });

  it("answers Siri's next test from where the clock stands", async () => {
    expect(await ask(ist("21", "05:00"), "when is my next test")).toBe("TBVP End-sem is on Wednesday, 25 November at 2:00 PM, in 4 days.");
    expect(await ask(ist("25", "05:00"), "when is my next test")).toBe("TBVP End-sem is today at 2:00 PM.");
    expect(await ask(ist("25", "19:00"), "when is my next test")).toBe("FDS End-sem is tomorrow at 2:00 PM.");
    expect(await ask(ist("27", "19:00"), "when is my next test")).toBe("OS End-sem is on Monday, 30 November at 2:00 PM, in 3 days.");
    expect(await ask(ist("28", "05:00"), "when is my next OS test")).toBe("OS End-sem is on Monday, 30 November at 2:00 PM, in 2 days.");
    expect(await ask(ist("30", "19:00"), "when is my next test")).toBe("No tests on your list.");
  });

  it("tells Siri the classes are over, and marks nothing absent", async () => {
    expect(await ask(ist("18", "05:00"), "can I skip OS")).toBe("Yes. OS has 5 classes to spare: you're at 85%, and the bar is 75%.");
    expect(await ask(ist("21", "05:00"), "can I skip OS")).toBe("OS's classes are over: you finished at 85%, and the bar is 75%.");
    expect(await ask(ist("21", "05:00"), "can I skip today")).toBe("Classes are over for the semester. Ask about a subject to hear where you finished.");
    const absent = await at(ist("26", "09:00"), `ask?q=${encodeURIComponent("I'm absent in OS")}`);
    expect([absent.body.say, absent.marked]).toEqual(["There are no classes today.", 0]);
  });

  it("keeps the papers in the calendar, with no class after the last teaching day", async () => {
    const ics = (await at(ist("21", "05:00"), "calendar.ics")).body as string;
    const starts = [...ics.matchAll(/DTSTART(?:;TZID=Asia\/Kolkata)?[:;](?:VALUE=DATE:)?(\d{8})/g)].map((m) => m[1]);
    expect(starts.filter((d) => d > "20261118").sort()).toEqual(["20261125", "20261126", "20261127", "20261130"]);
    expect(ics.match(/SUMMARY:[^\r\n]*End-sem/g)).toHaveLength(4);
  });
});
