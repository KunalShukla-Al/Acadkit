import { describe, expect, it } from "vitest";
import { applyToSem3, applyToSem4, plan, rowValue, rowsFromSem3, rowsFromSem4 } from "./desk-bridge.mjs";

const AT = Date.parse("2026-11-27T10:00:00Z");

describe("the Mac app's state as rows", () => {
  it("reads Sem 4's topics, watched videos and practice", () => {
    const rows = rowsFromSem4(
      { updatedAt: AT, topics: { "PS:1:2": "done", "PS:1:3": "bogus" }, watched: { abc123xyz: "2026-11-26T09:00:00Z" }, practice: { "ps-ct-1/A1": { pick: 1, done: "2026-11-27T09:00:00Z", revise: true }, "nope/A1": { pick: 0 } } },
      (id) => (id === "ps-ct-1/A1" ? "PS/ps-ct-1/A1" : null)
    );
    expect(rows).toEqual({
      "topic:PS:1.2": { status: "done", updated_at: "2026-11-27T10:00:00.000Z" },
      "video:abc123xyz": { attempted_at: "2026-11-26T09:00:00Z", updated_at: "2026-11-27T10:00:00.000Z" },
      "PS/ps-ct-1/A1": { flag: true, pick: "B", attempted_at: "2026-11-27T09:00:00Z", result: "unreviewed", updated_at: "2026-11-27T10:00:00.000Z" },
    });
  });

  it("reads Sem 3's question records and graded practice, each with its own time", () => {
    const rows = rowsFromSem3({
      items: { "q/OS/os-es-2023-05/A2": { status: "learning", flag: false, note: "", updatedAt: AT } },
      practice: { "OS/os-es-2023-05/A2": { option: "C", result: "wrong", submittedAt: AT, updatedAt: AT + 1000 } },
    });
    expect(rows["OS/os-es-2023-05/A2"]).toEqual({
      status: "learning", flag: false, note: null, pick: "C", result: "wrong", attempted_at: "2026-11-27T10:00:00.000Z", updated_at: "2026-11-27T10:00:01.000Z",
    });
  });
});

describe("writing a row back", () => {
  it("puts a Desk change into Sem 4's state", () => {
    const s = { topics: { "PS:1:2": "done" }, watched: {}, practice: {} };
    applyToSem4(s, "topic:PS:1.2", { status: "new" }, () => null);
    applyToSem4(s, "video:abc123xyz", { attempted_at: "2026-11-27T09:00:00Z" }, () => null);
    expect(applyToSem4(s, "PS/ps-ct-1/A1", { pick: "C", attempted_at: "t", flag: true }, (k) => k.slice(3))).toBe(true);
    expect(s).toEqual({ topics: {}, watched: { abc123xyz: "2026-11-27T09:00:00Z" }, practice: { "ps-ct-1/A1": { pick: 2, done: "t", revise: true } } });
  });

  it("puts a Desk change into Sem 3's state", () => {
    const s = { items: {}, practice: {} };
    applyToSem3(s, "OS/p/A1", { status: "revise", flag: true, note: null, pick: "A", result: "correct", attempted_at: "2026-11-27T10:00:00Z", updated_at: "2026-11-27T10:00:00Z" });
    expect(s.items["q/OS/p/A1"]).toEqual({ status: "revise", flag: true, note: "", updatedAt: AT });
    expect(s.practice["OS/p/A1"]).toMatchObject({ option: "A", result: "correct", submittedAt: AT });
  });
});

describe("plan", () => {
  const r = (over: object) => ({ status: null, flag: false, pick: null, attempted_at: null, result: null, note: null, updated_at: "2026-11-27T10:00:00Z", ...over });

  it("sends a Mac change and pulls a Desk change, from the last snapshot", () => {
    const snap = { a: rowValue(r({})), b: rowValue(r({})) };
    const mac = { a: r({ flag: true }), b: r({}) };
    const remote = { a: r({}), b: r({ pick: "B" }), c: r({ status: "done" }) };
    const { push, pull } = plan(mac, remote, snap);
    expect(push.map((x) => x.item_key)).toEqual(["a"]);
    expect(pull.map((x) => x.item_key)).toEqual(["b", "c"]);
  });

  it("lets the later write win when both sides moved", () => {
    const snap = { a: rowValue(r({})) };
    const mac = { a: r({ flag: true, updated_at: "2026-11-27T11:00:00Z" }) };
    const remote = { a: r({ pick: "A", updated_at: "2026-11-27T10:30:00Z" }) };
    expect(plan(mac, remote, snap).push.map((x) => x.item_key)).toEqual(["a"]);
    expect(plan({ a: { ...mac.a, updated_at: "2026-11-27T10:00:00Z" } }, remote, snap).pull.map((x) => x.item_key)).toEqual(["a"]);
  });

  it("does nothing when both sides agree", () => {
    expect(plan({ a: r({ flag: true }) }, { a: r({ flag: true, updated_at: "later" }) }, {})).toEqual({ push: [], pull: [] });
  });
});
