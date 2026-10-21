import { describe, expect, it } from "vitest";
import { checkRunup, splitRunup } from "./runup.mjs";

const known = new Set(["Operating_Systems/07_PYQs/FT-II/2025_FJ2.pdf", "Operating_Systems/02_Notes/Unit_2/threads.pdf"]);

const base = (extra: Record<string, unknown> = {}) => ({
  version: 1,
  title: "Run-up",
  start: "2026-10-12",
  end: "2026-11-30",
  events: [
    {
      id: "os-ft2",
      subject_code: "21CSC202J",
      title: "OS FT-II",
      kind: "test",
      date: "2026-10-29",
      target: { score: 12, max: 15, note: "two-thirds and a bit" },
      units: [3, 2, 2, 11],
      scoring: ["Draw the three thread models", "  "],
      pyqs: [
        { source: "FJ2 2025 Set B", file: "Operating_Systems/07_PYQs/FT-II/2025_FJ2.pdf", page: 1, number: 6, marks: 10, unit: 2, text: "Compare thread models" },
        { file: "gone.pdf", text: "A question whose scan left the folder" },
        { text: "" },
      ],
      files: [{ path: "Operating_Systems/02_Notes/Unit_2/threads.pdf", why: "slides" }, "missing.pdf"],
    },
  ],
  days: [
    {
      date: "2026-10-12",
      focus: "Threads",
      tasks: [
        { id: "2026-10-12#1", text: "Sketch the models", event: "os-ft2", minutes: 45, files: ["Operating_Systems/02_Notes/Unit_2/threads.pdf"] },
        { id: "2026-10-12#2", text: "Something else", event: "nope" },
      ],
    },
  ],
  ...extra,
});

describe("checkRunup", () => {
  it("keeps a full plan and tidies what it can", () => {
    const { body, warnings } = checkRunup(base(), known);
    expect(body).not.toBeNull();
    const e = body!.events[0];
    expect(e.units).toEqual([2, 3]);
    expect(e.scoring).toEqual(["Draw the three thread models"]);
    expect(e.target).toEqual({ score: 12, max: 15, note: "two-thirds and a bit" });
    expect(e.files).toEqual([{ path: "Operating_Systems/02_Notes/Unit_2/threads.pdf", why: "slides" }]);
    expect(e.pyqs).toHaveLength(2);
    expect(e.pyqs[0]).toMatchObject({ number: "6", page: 1, file: "Operating_Systems/07_PYQs/FT-II/2025_FJ2.pdf" });
    // A question is kept even when its scan is gone; only the link goes.
    expect(e.pyqs[1]).toMatchObject({ file: null, page: null, text: "A question whose scan left the folder" });
    const [t1, t2] = body!.days[0].tasks;
    expect(t1).toEqual({
      id: "2026-10-12#1",
      text: "Sketch the models",
      subject_code: null,
      event: "os-ft2",
      minutes: 45,
      files: ["Operating_Systems/02_Notes/Unit_2/threads.pdf"],
    });
    expect(t2.event).toBeNull();
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("no such file missing.pdf"),
        expect.stringContaining("1 past-paper question(s)"),
        expect.stringContaining("no event nope"),
      ])
    );
  });

  it("takes a link through the study folder's own name", () => {
    const plan = base({
      days: [{ date: "2026-10-13", tasks: [{ id: "a", text: "Threads", files: ["SRM_Sem3/Operating_Systems/02_Notes/Unit_2/threads.pdf", "SRM_Sem4/x.pdf"] }] }],
    });
    const { body, warnings } = checkRunup(plan, known, "SRM_Sem3");
    expect(body!.days[0].tasks[0].files).toEqual(["Operating_Systems/02_Notes/Unit_2/threads.pdf"]);
    expect(warnings).toContain("task a: no such file SRM_Sem4/x.pdf");
  });

  it("refuses a plan without a valid window", () => {
    expect(checkRunup(base({ start: "2026-12-01" }), known).body).toBeNull();
    expect(checkRunup(base({ end: "2026-13-01" }), known).body).toBeNull();
    expect(checkRunup({}, known).body).toBeNull();
  });

  it("rejects impossible calendar dates", () => {
    const { body, warnings } = checkRunup(
      base({ events: [], days: [{ date: "2026-11-31", tasks: [{ id: "x", text: "y" }] }] }),
      known
    );
    expect(body!.days).toEqual([]);
    expect(warnings[0]).toMatch(/day 1/);
  });

  it("drops days outside the window and a repeated day", () => {
    const { body, warnings } = checkRunup(
      base({
        events: [],
        days: [
          { date: "2026-10-01", tasks: [] },
          { date: "2026-10-13", tasks: [{ id: "a", text: "one" }] },
          { date: "2026-10-13", tasks: [{ id: "b", text: "two" }] },
        ],
      }),
      known
    );
    expect(body!.days.map((d) => d.date)).toEqual(["2026-10-13"]);
    expect(body!.days[0].tasks.map((t) => t.id)).toEqual(["a"]);
    expect(warnings).toHaveLength(2);
  });

  it("never lets one tick count for two tasks", () => {
    const { body, warnings } = checkRunup(
      base({
        events: [],
        days: [
          { date: "2026-10-13", tasks: [{ id: "same", text: "one" }] },
          { date: "2026-10-14", tasks: [{ id: "same", text: "two" }] },
        ],
      }),
      known
    );
    expect(body!.days.flatMap((d) => d.tasks).map((t) => t.text)).toEqual(["one"]);
    expect(warnings[0]).toMatch(/used twice/);
  });

  it("drops a broken event and a broken target but keeps the rest", () => {
    const { body, warnings } = checkRunup(
      base({
        events: [
          { id: "bad id with spaces", title: "x" },
          { id: "ok", title: "Fine", date: "soon", target: { score: 20, max: 15 }, kind: "weird" },
          { id: "ok", title: "Twice" },
        ],
        days: [],
      }),
      known
    );
    expect(body!.events).toHaveLength(1);
    expect(body!.events[0]).toMatchObject({ id: "ok", date: null, target: null, kind: "other" });
    expect(warnings).toHaveLength(4);
  });

  it("orders events by date, undated last, and days by date", () => {
    const { body } = checkRunup(
      base({
        events: [
          { id: "c", title: "Undated" },
          { id: "b", title: "Later", date: "2026-11-02" },
          { id: "a", title: "Sooner", date: "2026-10-20" },
        ],
        days: [
          { date: "2026-10-20", tasks: [] },
          { date: "2026-10-14", tasks: [] },
        ],
      }),
      known
    );
    expect(body!.events.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(body!.days.map((d) => d.date)).toEqual(["2026-10-14", "2026-10-20"]);
  });
});

describe("splitRunup", () => {
  const { body } = checkRunup(base({ days: [...base().days, { date: "2026-11-02", focus: null, tasks: [{ id: "n1", text: "November" }] }] }), known);

  it("writes an index, a file of days per month, and the questions per event", () => {
    const { index, parts } = splitRunup(body);
    expect(index.version).toBe(2);
    expect(index).not.toHaveProperty("days");
    expect(index.months).toHaveLength(2);
    expect(index.months[0]).toMatch(/^runup\/2026-10-[0-9a-f]{12}\.json$/);
    const e = index.events[0];
    expect(e).not.toHaveProperty("pyqs");
    expect(e.pyqCount).toBe(2);
    expect(e.pyqsFile).toMatch(/^runup\/pyqs-os-ft2-[0-9a-f]{12}\.json$/);
    const byName = new Map(parts.map((p) => [p.name, JSON.parse(p.json)]));
    expect(byName.get(index.months[1]).days.map((d: { date: string }) => d.date)).toEqual(["2026-11-02"]);
    expect(byName.get(e.pyqsFile).pyqs).toHaveLength(2);
  });

  it("names a part by its content, so an unchanged month keeps its name", () => {
    const a = splitRunup(body);
    const edited = { ...body, days: body.days.map((d) => (d.date === "2026-11-02" ? { ...d, focus: "changed" } : d)) };
    const b = splitRunup(edited);
    expect(b.index.months[0]).toBe(a.index.months[0]);
    expect(b.index.months[1]).not.toBe(a.index.months[1]);
    expect(b.index.events[0].pyqsFile).toBe(a.index.events[0].pyqsFile);
  });
});

