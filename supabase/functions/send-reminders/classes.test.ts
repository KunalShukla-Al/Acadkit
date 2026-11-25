import { describe, expect, it } from "vitest";
import { buildEffectiveMap } from "../../../packages/core/src/calendar.ts";
import { OFFICIAL_HOLIDAYS as CORE_HOLIDAYS } from "../../../packages/core/src/semester.ts";
import { subjectShort } from "../../../packages/core/src/subjectShort.ts";
import { computeSubjectAttendance } from "../../../packages/core/src/attendance.ts";
import type { AttendanceRecord, PortalSnapshot, Subject } from "../../../packages/core/src/types.ts";
import { PORTAL_BASELINE } from "./fixtures/portal-baseline.ts";
import { OFFICIAL_HOLIDAYS } from "./calendar.generated.ts";
import {
  advise,
  classMessage,
  dayMessage,
  effectiveMap,
  short,
  standing,
  unmarked,
  type AttendanceData,
  type DeclaredDay,
  type Mark,
  type Slot,
} from "./classes.ts";

const WINDOW = { start: "2026-07-21", end: "2026-11-20" };

// The Sem 3 calendar behind the 10–20 Nov reminders, which used the day before's day order.
const SEM3: DeclaredDay[] = [
  { date: "2026-08-24" },
  { date: "2026-10-24", day_order: 3 },
  { date: "2026-11-09", cancels: true },
];

describe("the reminders' calendar is the app's", () => {
  const cases: Record<string, DeclaredDay[]> = {
    "nothing declared": [],
    "a holiday that shifts": [{ date: "2026-08-24" }],
    "a holiday that cancels in place": [{ date: "2026-11-09", cancels: true }],
    "a class Saturday": [{ date: "2026-10-24", day_order: 3 }],
    "the Sem 3 calendar": SEM3,
  };
  for (const [name, declared] of Object.entries(cases)) {
    it(name, () => {
      const core = buildEffectiveMap(declared as never, WINDOW);
      expect(effectiveMap(declared, WINDOW.start, WINDOW.end)).toEqual(core);
    });
  }

  it("a cancelled day order is lost, not pushed onto the next day", () => {
    const map = effectiveMap(SEM3, WINDOW.start, WINDOW.end);
    expect(map["2026-11-06"]).toBe(2);
    expect(map["2026-11-09"]).toBeUndefined();
    expect(map["2026-11-10"]).toBe(4);
    expect(map["2026-11-20"]).toBe(2);
  });

  it("knows the same official holidays (npm run gen:edge-calendar after changing them)", () => {
    expect(OFFICIAL_HOLIDAYS).toEqual(CORE_HOLIDAYS);
  });
});

it("names subjects as the app's chips do", () => {
  const names = [
    { name: "Transforms & boundary value problems" },
    { name: "Data structures & algorithms" },
    { name: "UNIVERSAL HUMAN VALUES – II" },
    { name: "Operating Systems", short_name: "OS " },
    { name: "Advanced OOP" },
    { name: "Physics" },
  ];
  for (const s of names) expect(short(s)).toBe(subjectShort(s));
});

describe("whether a class can be skipped", () => {
  // OS on Day Order 1 at 9:45 in September: the 1st, 9th, 17th and 24th (the 4th and 14th are holidays).
  const slot: Slot = { id: "t1", subject_id: "os", day_order: 1, start_time: "09:45:00", room: "TP 402" };
  const window = { semStart: "2026-09-01", semEnd: "2026-09-30" };
  const eff = effectiveMap([], window.semStart, window.semEnd);
  const days = Object.keys(eff).filter((d) => eff[d] === 1).sort();
  const mark = (date: string, present: boolean): Mark => ({ subject_id: "os", date, start_time: "09:45:00", status: present ? "present" : "absent" });
  const data = (marks: Mark[], snapshot?: AttendanceData["snapshot"]): AttendanceData => ({ slots: [slot], marks, snapshot, eff, ...window });

  it("counts the classes before now nobody marked as attended, and the rest as ahead", () => {
    const st = standing("os", data([mark(days[0], false)]), days[2], "09:45");
    expect(st).toMatchObject({ attended: 1, held: 2 }); // 1 Sep absent, 9 Sep unmarked
    expect(st.ahead.map((a) => a.date)).toEqual(days.slice(2));
  });

  it("starts from the portal's count, with only what came after it", () => {
    const st = standing("os", data([mark(days[0], false), mark(days[1], false)], { conducted: 20, absent: 2, as_of: days[0] }), days[2], "09:45");
    expect(st).toMatchObject({ attended: 18, held: 21 });
  });

  it("says skip while there are classes to spare, and how many are left after", () => {
    // 18 of 20 from the portal and both classes ahead to spare: 18/22 is 81.8%.
    const adv = advise(standing("os", data([], { conducted: 20, absent: 2, as_of: days[1] }), days[2], "09:45"), 75);
    expect(adv.spare).toBe(2);
    const msg = classMessage("OS", slot, 1, adv, 75);
    expect(msg.title).toBe("You can skip OS");
    expect(msg.body).toBe("9:45 AM · Day Order 1 · TP 402\nSkipping leaves 1 more to spare and keeps you over 75%.");
  });

  it("says attend when none are left to spare", () => {
    // 15 of 20, 2 ahead: missing one ends at 16/22 = 72.7%.
    const adv = advise(standing("os", data([], { conducted: 20, absent: 5, as_of: days[1] }), days[2], "09:45"), 75);
    expect(adv.spare).toBe(0);
    expect(classMessage("OS", slot, 1, adv, 75)).toEqual({
      title: "Attend OS",
      body: "9:45 AM · Day Order 1 · TP 402\nNone to spare: missing it takes you under 75%.",
    });
  });

  it("under the bar, says when attending every class gets it back, or that it can't", () => {
    // 14 of 20 (70%), 2 ahead: both is 16/22 = 72.7%, short of 75.
    const out = advise(standing("os", data([], { conducted: 20, absent: 6, as_of: days[1] }), days[2], "09:45"), 75);
    expect(classMessage("OS", slot, 1, out, 75).body).toContain("You're at 70%, and 75% is out of reach this semester.");
    // At 65 (medical leave), 6 of 10 (60%): one more is 7/11 = 63.6%, two is 8/12 = 66.7%.
    const back = advise(standing("os", data([], { conducted: 10, absent: 4, as_of: days[1] }), days[2], "09:45"), 65);
    expect(back.under).toBe(true);
    expect(classMessage("OS", slot, 1, back, 65).body).toContain("You're at 60%. Attend every class and you're back over 65% on 24 Sep.");
  });
});

it("the evening nudge checks the day's own classes: 12 Nov, Day Order 1, all marked", () => {
  const eff = effectiveMap(SEM3, WINDOW.start, WINDOW.end);
  const slots: Slot[] = [
    { id: "a", subject_id: "tbvp", day_order: 1, start_time: "08:00:00" },
    { id: "b", subject_id: "tbvp", day_order: 1, start_time: "08:50:00" },
    { id: "c", subject_id: "os", day_order: 5, start_time: "09:45:00" },
  ];
  const marks: Mark[] = ["08:00:00", "08:50:00"].map((t) => ({ subject_id: "tbvp", date: "2026-11-12", start_time: t, status: "present" }));
  const today = slots.filter((s) => s.day_order === eff["2026-11-12"]);
  expect(eff["2026-11-12"]).toBe(1);
  expect(unmarked(today, marks, "2026-11-12")).toBe(0);
});

describe("the morning's plan", () => {
  it("names the day order and splits the subjects into skip and attend", () => {
    const msg = dayMessage(2, "09:45:00", 6, [
      { label: "OS", skippable: true },
      { label: "DSA", skippable: false },
      { label: "FDS", skippable: true },
    ]);
    expect(msg).toEqual({ title: "Day Order 2: 6 classes, first at 9:45 AM", body: "Can skip: OS, FDS\nAttend: DSA" });
    expect(dayMessage(4, "12:30:00", 1, [{ label: "TBVP", skippable: false }]).body).toBe("Attend: TBVP");
  });
});

describe("the portal baseline: a sync on a class day, before its classes", () => {
  const c = PORTAL_BASELINE;

  it("the app counts the classes marked after the sync", () => {
    const records: AttendanceRecord[] = c.marks.map((m, i) => ({ ...m, id: `r${i}`, device_id: "1234", end_time: "" }));
    const snapshot: PortalSnapshot = { ...c.snapshot, id: "snap", device_id: "1234" };
    const app = computeSubjectAttendance(c.subject as Subject, records, snapshot);
    expect([app.attended, app.total]).toEqual([c.expected.attended, c.expected.total]);
  });

  // Release blocker 8: the reminders drop the snapshot's whole day and read 42 of 60. The fix
  // (29 Nov) makes this pass; then it becomes a plain `it`.
  it.fails("the reminders start from the same count as the app", () => {
    const data: AttendanceData = { slots: c.slots, marks: c.marks, snapshot: c.snapshot, eff: c.eff, semStart: c.semStart, semEnd: c.semEnd };
    const now = standing(c.subject.id, data, c.asked.date, c.asked.start);
    expect([now.attended, now.held]).toEqual([c.expected.attended, c.expected.total]);
  });
});
