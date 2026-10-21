import { describe, expect, it } from "vitest";
import { countdownLabel, examUrgency, HORIZON_DAYS, nextExam } from "@/lib/examCountdown";
import type { Deadline } from "@acadkit/core/types";

const TODAY = "2026-09-07";
const NOW = new Date(2026, 8, 7, 9, 0); // 9:00 AM local on TODAY

const exam = (due: string, over: Partial<Deadline> = {}): Deadline =>
  ({
    id: due,
    type: "exam",
    status: "pending",
    due_date: due,
    ...over,
  }) as Deadline;

describe("nextExam", () => {
  it("says nothing when there are no deadlines", () => {
    expect(nextExam(undefined, NOW)).toBeNull();
    expect(nextExam([], NOW)).toBeNull();
  });

  it("picks the soonest exam", () => {
    const c = nextExam([exam("2026-09-20"), exam("2026-09-10"), exam("2026-09-15")], NOW)!;
    expect(c.deadline.due_date).toBe("2026-09-10");
    expect(c.daysAway).toBe(3);
  });

  it("ignores labs and assignments", () => {
    // Those already have a row in the deadlines card, and nobody
    // practises toward a lab record.
    const c = nextExam(
      [exam("2026-09-08", { type: "lab" }), exam("2026-09-12")],
      NOW
    )!;
    expect(c.deadline.due_date).toBe("2026-09-12");
  });

  it("ignores exams already marked done", () => {
    expect(nextExam([exam("2026-09-09", { status: "done" })], NOW)).toBeNull();
  });

  it("counts an exam today, which is when it matters most", () => {
    const c = nextExam([exam(TODAY)], NOW)!;
    expect(c.daysAway).toBe(0);
  });

  it("keeps an exam for three hours after it starts, then lets it go", () => {
    // An 8:00 AM test: still on the card while you sit it, gone by 11.
    const due = new Date(2026, 8, 7, 8, 0).toISOString();
    const at = (h: number, m = 0) => new Date(2026, 8, 7, h, m);
    expect(nextExam([exam(due)], at(7))?.daysAway).toBe(0);
    expect(nextExam([exam(due)], at(10, 59))?.daysAway).toBe(0);
    expect(nextExam([exam(due)], at(11))).toBeNull();
  });

  it("moves on to the next exam once today's is over", () => {
    const done = new Date(2026, 8, 7, 8, 0).toISOString();
    const next = new Date(2026, 8, 9, 8, 0).toISOString();
    const c = nextExam([exam(done), exam(next)], new Date(2026, 8, 7, 12, 0))!;
    expect(c.deadline.due_date).toBe(next);
  });

  it("keeps a date with no time for the whole day", () => {
    expect(nextExam([exam(TODAY)], new Date(2026, 8, 7, 23, 0))?.daysAway).toBe(0);
  });

  it("drops an exam that has already happened", () => {
    expect(nextExam([exam("2026-09-06")], NOW)).toBeNull();
  });

  it("stays quiet beyond the horizon", () => {
    // A countdown to something seven weeks out is a fact, not a prompt.
    const justInside = "2026-09-28"; // 21 days
    const justOutside = "2026-09-29"; // 22 days
    expect(nextExam([exam(justInside)], NOW)?.daysAway).toBe(HORIZON_DAYS);
    expect(nextExam([exam(justOutside)], NOW)).toBeNull();
  });

  it("tolerates a timestamp in due_date", () => {
    const c = nextExam([exam("2026-09-10T14:30:00")], NOW)!;
    expect(c.daysAway).toBe(3);
  });
});

describe("countdownLabel", () => {
  it("names the near days rather than counting them", () => {
    expect(countdownLabel(0)).toBe("today");
    expect(countdownLabel(1)).toBe("tomorrow");
    expect(countdownLabel(6)).toBe("6 days");
  });
});

describe("examUrgency", () => {
  it("bands coarsely, so a change of colour is news", () => {
    expect(examUrgency(0)).toBe("imminent");
    expect(examUrgency(1)).toBe("imminent");
    expect(examUrgency(2)).toBe("near");
    expect(examUrgency(6)).toBe("near");
    expect(examUrgency(7)).toBe("far");
  });
});
