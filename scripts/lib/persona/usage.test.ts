import { describe, expect, it } from "vitest";
import { usage, usageBrief, usageLines } from "./usage.mjs";

const now = new Date("2026-12-06T01:00:00Z");

function fakeSupabase() {
  const filters: string[] = [];
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "like", "gte"]) c[m] = (...a: unknown[]) => (filters.push(`${m}:${a.slice(0, 2).join("=")}`), c);
    c.then = (r: (v: unknown) => void) => r(result);
    return c;
  };
  return {
    filters,
    from: (t: string) =>
      t === "suggestions"
        ? chain({ data: [{ status: "accepted" }, { status: "accepted" }, { status: "dismissed" }, { status: "pending" }], error: null })
        : chain({ count: 5, error: null }),
    storage: {
      from: () => ({
        list: async () => ({
          data: [
            { name: "heartbeat.json", updated_at: "2026-12-05T00:00:00Z" },
            { name: "a.json", updated_at: "2026-12-01T00:00:00Z" },
            { name: "b.json", updated_at: "2026-11-01T00:00:00Z" },
          ],
          error: null,
        }),
      }),
    },
  };
}

describe("the 14-day cut rule", () => {
  it("counts what I used of each engine", async () => {
    const supabase = fakeSupabase();
    const u = await usage({ supabase, pin: "1234", now });
    expect(u).toEqual({ deadlines: { offered: 4, added: 2, dismissed: 1 }, briefs: 5, asks: 1 });
    expect(supabase.filters).toContain("like:source=WhatsApp%");
    expect(usageBrief(u)).toBe("PersonaOS, last 14 days: 2 dates added from your groups, 1 Ask question, 5 briefs.");
  });

  it("names the engines nobody used", () => {
    expect(usageLines({ deadlines: { offered: 3, added: 0, dismissed: 3 }, briefs: 4, asks: 0 }).at(-1)).toBe("Unused for 14 days: deadlines, ask. Redesign or remove.");
  });
});
