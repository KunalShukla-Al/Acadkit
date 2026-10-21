import { describe, expect, it } from "vitest";
import { continueOffer, deviceKind, type Reading } from "@/lib/reading";

const NOW = Date.parse("2026-11-09T10:30:00Z");
const reading = (over: Partial<Reading> = {}): Reading => ({ path: "OS/notes.pdf", page: 24, kind: "phone", updated_at: "2026-11-09T10:20:00Z", ...over });

describe("continuing on the other device", () => {
  it("offers a page read lately on the other kind of device", () => {
    expect(continueOffer(reading(), { kind: "computer", now: NOW })).toEqual(reading());
  });

  it("offers nothing from this kind of device, or stale, or open already", () => {
    expect(continueOffer(reading(), { kind: "phone", now: NOW })).toBeNull();
    expect(continueOffer(reading({ updated_at: "2026-11-09T09:50:00Z" }), { kind: "computer", now: NOW })).toBeNull();
    expect(continueOffer(reading(), { kind: "computer", now: NOW, open: "OS/notes.pdf" })).toBeNull();
    expect(continueOffer(null, { kind: "computer", now: NOW })).toBeNull();
  });

  it("calls a touch screen without a mouse a phone", () => {
    const win = (coarse: boolean, fine: boolean) => ({ matchMedia: (q: string) => ({ matches: q.includes("coarse") ? coarse : fine }) }) as unknown as Window;
    expect([deviceKind(win(true, false)), deviceKind(win(true, true)), deviceKind(win(false, true))]).toEqual(["phone", "computer", "computer"]);
  });
});
