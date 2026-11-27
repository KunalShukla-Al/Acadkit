import { describe, expect, it } from "vitest";
import { lastClassDay, syncHealth } from "@/lib/syncHealth";
import type { PortalSnapshot } from "@acadkit/core/types";

const snap = (as_of: string): PortalSnapshot =>
  ({ as_of, subject_code: "X", conducted: 10, absent: 1 }) as PortalSnapshot;

const TODAY = new Date("2026-09-10T12:00:00");

describe("syncHealth", () => {
  it("reports never when nothing has ever synced", () => {
    expect(syncHealth([], TODAY).state).toBe("never");
  });

  it("is fresh for the first couple of days", () => {
    expect(syncHealth([snap("2026-09-10")], TODAY).state).toBe("fresh");
    expect(syncHealth([snap("2026-09-08")], TODAY).state).toBe("fresh");
  });

  it("ages, then goes stale", () => {
    expect(syncHealth([snap("2026-09-07")], TODAY).state).toBe("aging");
    expect(syncHealth([snap("2026-09-03")], TODAY).state).toBe("stale");
  });

  it("takes the oldest subject, not the newest", () => {
    // One subject lagging means the picture as a whole is that old.
    const h = syncHealth([snap("2026-09-10"), snap("2026-09-01")], TODAY);
    expect(h.asOf).toBe("2026-09-01");
    expect(h.state).toBe("stale");
  });

  it("never reports a negative age", () => {
    // Clock skew, or a portal reporting tomorrow's date.
    expect(syncHealth([snap("2026-09-12")], TODAY).days).toBe(0);
  });

  it("goes final once the portal has read the last class day", () => {
    // Classes ended on 20 Nov and the portal read that day: a week later it can't have changed.
    const later = new Date("2026-11-27T10:00:00");
    expect(syncHealth([snap("2026-11-20")], later, "2026-11-20").state).toBe("final");
    expect(syncHealth([snap("2026-11-20")], later, "2026-11-20").days).toBe(7);
  });

  it("stays stale when classes ran after the last read", () => {
    const later = new Date("2026-11-27T10:00:00");
    expect(syncHealth([snap("2026-11-18")], later, "2026-11-20").state).toBe("stale");
  });

  it("finds the last day with a day order", () => {
    expect(lastClassDay({ "2026-11-18": 3, "2026-11-20": 5, "2026-11-19": 4 })).toBe("2026-11-20");
    expect(lastClassDay({})).toBeNull();
  });
});
