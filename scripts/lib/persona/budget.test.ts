import { describe, expect, it } from "vitest";
import { DEFAULT_CAP, capOf, spend } from "./budget.mjs";

describe("the Claude cap", () => {
  it("comes from PERSONA_CLAUDE_CAP, 20 when unset or not a count", () => {
    expect([capOf({}), capOf({ PERSONA_CLAUDE_CAP: "5" }), capOf({ PERSONA_CLAUDE_CAP: "0" }), capOf({ PERSONA_CLAUDE_CAP: "lots" })]).toEqual([
      DEFAULT_CAP,
      5,
      0,
      DEFAULT_CAP,
    ]);
  });
});

describe("spending", () => {
  const day = new Date(2026, 11, 1, 9);
  const next = new Date(2026, 11, 2, 0, 1);

  it("counts calls through the day and refuses one past the cap", () => {
    let b = spend(null, 2, 3, day);
    expect(b).toEqual({ ok: true, budget: { day: "2026-12-01", used: 2 } });
    b = spend(b.budget, 1, 3, day);
    expect(b.ok).toBe(true);
    expect(spend(b.budget, 1, 3, day)).toEqual({ ok: false, budget: { day: "2026-12-01", used: 3 } });
  });

  it("starts again at midnight", () => {
    expect(spend({ day: "2026-12-01", used: 3 }, 1, 3, next)).toEqual({ ok: true, budget: { day: "2026-12-02", used: 1 } });
  });
});
