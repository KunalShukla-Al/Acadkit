import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { briefLines, learningToday, publishBrief, publishPhone, todayData } from "./phone.mjs";

const now = new Date("2026-11-28T01:00:00Z"); // 06:30 in India
const confirmed = { uid: "deadline-d1@acadkit", start: "2026-11-30T08:30:00Z", summary: "OS End Sem" };
const done = { uid: "deadline-d2@acadkit", start: "2026-11-29T08:30:00Z", summary: "✓ OS Worksheet" };
const fresh = { uid: "suggested-21CSC204J-FT-I-2027-01-27@persona", start: "2027-01-27T04:00:00Z", summary: "? DAA FT-I (not confirmed)" };

describe("the morning brief", () => {
  it("says what AcadKit's own reminders don't, in at most four lines", () => {
    const lines = briefLines({
      events: [confirmed, fresh],
      questions: [{ question: "21CSC205P CT-I: I have 2027-02-02 (a classmate) or 2027-02-03 (a classmate). Which is right?" }, { question: "x" }],
      signals: [
        { kind: "mercor", title: "Your assessment invite: Code Review" },
        { kind: "github", title: "Run failed" },
        { kind: "job", title: "ML intern" },
      ],
      github: { waiting: [{ repo: "me/Acadkit", number: 86, ci: "passing" }, { repo: "me/Acadkit", number: 87, ci: "failing" }], pushed_days: ["2026-11-25"] },
      now,
    });
    expect(lines).toEqual([
      "New from your groups: DAA FT-I Wed 27 Jan. Add them in AcadKit.",
      "Unsure: 21CSC205P CT-I: I have 2027-02-02 (a classmate) or 2027-02-03 (a classmate). Which is right? (+1 more)",
      "Mail: Mercor: “Your assessment invite: Code Review”; 1 job or course mail.",
      "GitHub: 2 PRs wait for your merge (Acadkit #86, Acadkit #87); checks fail on #87; no push yesterday.",
    ]);
  });

  it("leads with a portal login, then new marks, and keeps to five lines", () => {
    const lines = briefLines({
      events: [fresh],
      questions: [{ question: "q" }],
      signals: [{ kind: "login", title: "Student Portal logged out at 15:02 (4 h 50 min held). Log in on the Mac." }, { kind: "marks", title: "Operating Systems: 48.5 / 60 (was 41)" }, { kind: "mercor", title: "Payment sent" }],
      github: { waiting: [{ repo: "me/Acadkit", number: 88, ci: "passing" }], pushed_days: [] },
      learning: ["Maths · LA · Week 1 (90 min)"],
      weekly: "PersonaOS, last 14 days: …",
      now,
    });
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe("Student Portal logged out at 15:02 (4 h 50 min held). Log in on the Mac.");
    expect(lines[2]).toBe("New marks: Operating Systems: 48.5 / 60 (was 41).");
    expect(lines[4]).toBe("Learning today: Maths · LA · Week 1 (90 min).");
  });

  it("finds today's learning tasks in the Run-up", () => {
    const runup = { days: [{ date: "2026-11-28", tasks: [{ id: "s4:ps01", text: "P&S U1" }, { id: "learn:la01", text: "Maths · LA · Week 1", minutes: "90" }] }] };
    expect(learningToday(runup, now)).toEqual(["Maths · LA · Week 1 (90 min)"]);
    expect(learningToday(null, now)).toEqual([]);
  });

  it("is empty on a quiet day", () => {
    expect(briefLines({ events: [confirmed], questions: [], signals: [], github: { waiting: [], pushed_days: ["2026-11-27"] }, now })).toEqual([]);
  });
});

describe("the widget's data", () => {
  it("holds the next three days, minus what's done, and the count not yet confirmed", () => {
    const data = todayData({ events: [done, confirmed, fresh], lines: ["a"], now });
    expect(data.due).toEqual([{ when: confirmed.start, title: "OS End Sem" }]);
    expect(data.brief).toEqual(["a"]);
    expect(data.unconfirmed).toBe(1);
  });
});

describe("publishing", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "persona-phone-"));
    await writeFile(path.join(dir, "suggestions.json"), JSON.stringify({ deadlines: [{ subject_code: "21CSC204J", label: "FT-I", due_date: "2027-01-27T09:30:00+05:30", source: "s", evidence: "e" }] }));
    await writeFile(path.join(dir, "github.json"), JSON.stringify({ waiting: [], pushed_days: ["2026-11-27"] }));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const fakeSupabase = () => {
    const uploads = new Map<string, { body: string; type: string }>();
    const table = (rows: unknown[]) => ({ select: () => ({ eq: () => ({ gte: async () => ({ data: rows, error: null }), then: (r: (v: unknown) => void) => r({ data: rows, error: null }) }) }) });
    return {
      uploads,
      from: (name: string) =>
        name === "deadlines"
          ? table([{ id: "d1", subject_id: "s1", title: "End Sem", type: "exam", due_date: "2026-11-30T08:30:00Z", status: "pending", source: null }])
          : table([{ id: "s1", code: "21CSC202J", short_name: "OS", name: "Operating Systems" }]),
      storage: { from: () => ({ upload: vi.fn(async (key: string, body: string, o: { contentType: string }) => (uploads.set(key, { body, type: o.contentType }), { error: null })) }) },
    };
  };

  it("uploads the calendar and the widget's data beside it", async () => {
    const supabase = fakeSupabase();
    const note = await publishPhone({ supabase, pin: "1234", suggestionsFile: path.join(dir, "suggestions.json"), now, dir });
    expect(note).toBe("2 events (1 not confirmed)");
    const keys = [...supabase.uploads.keys()];
    expect(keys[0]).toMatch(/^1234\/calendar\/[0-9a-f]{24}\.ics$/);
    expect(keys[1]).toBe(keys[0].replace(".ics", "-today.json"));
    expect(supabase.uploads.get(keys[0])!.body).toContain("SUMMARY:? DAA FT-I (not confirmed)".replace("DAA", "21CSC204J"));
    expect(JSON.parse(supabase.uploads.get(keys[1])!.body).due[0].title).toBe("OS End Sem");
  });

  it("writes the day's brief for send-reminders", async () => {
    const supabase = fakeSupabase();
    expect(await publishBrief({ supabase, pin: "1234", suggestionsFile: path.join(dir, "suggestions.json"), now, dir })).toBe("1 line");
    expect(JSON.parse(supabase.uploads.get("1234/persona/brief.json")!.body)).toEqual({
      date: "2026-11-28",
      lines: ["New from your groups: 21CSC204J FT-I Wed 27 Jan. Add them in AcadKit."],
    });
  });
});
