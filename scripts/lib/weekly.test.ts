import { describe, expect, it } from "vitest";
import { checkNotices, checkProjects } from "./weekly.mjs";

describe("checkNotices", () => {
  const known = new Set(["Fundamentals_of_Data_Science/FT3_portion.pdf"]);

  it("keeps a full notice", () => {
    const { body, warnings } = checkNotices(
      {
        notices: [
          {
            subject_code: "21CSS202T",
            text: " FT-III covers Unit 4 and half of Unit 5 ",
            source: "FDS WhatsApp",
            posted: "2026-10-09",
            until: "2026-10-15",
            file: "Fundamentals_of_Data_Science/FT3_portion.pdf",
          },
        ],
      },
      known
    );
    expect(warnings).toEqual([]);
    expect(body.notices).toEqual([
      {
        subject_code: "21CSS202T",
        text: "FT-III covers Unit 4 and half of Unit 5",
        source: "FDS WhatsApp",
        posted: "2026-10-09",
        until: "2026-10-15",
        file: "Fundamentals_of_Data_Science/FT3_portion.pdf",
      },
    ]);
  });

  it("drops a notice with no text or no end date, and says why", () => {
    const { body, warnings } = checkNotices({ notices: [{ until: "2026-10-15" }, { text: "Bring the record", until: "15 Oct" }] }, known);
    expect(body.notices).toEqual([]);
    expect(warnings).toEqual(["notice 1: needs text", 'notice 2: needs an end date, "until": "YYYY-MM-DD"']);
  });

  it("keeps a notice whose file is missing, without the file", () => {
    const { body, warnings } = checkNotices({ notices: [{ text: "Venue changed to TP 401", until: "2026-10-12", file: "gone.pdf" }] }, known);
    expect(body.notices[0]).toMatchObject({ text: "Venue changed to TP 401", file: null, subject_code: null, posted: null });
    expect(warnings).toEqual(["notice 1: no such file gone.pdf, shown without it"]);
  });

  it("is empty for a missing list", () => {
    expect(checkNotices({}, known).body.notices).toEqual([]);
  });
});

describe("checkProjects", () => {
  it("keeps projects and to-dos, filling defaults", () => {
    const { body, warnings } = checkProjects({
      updated: "2026-10-10",
      projects: [
        { name: "m2-infer", state: "active", status: "Day 3 of 23", next: "GPU bandwidth", url: "https://github.com/x/m2-infer" },
        { name: "fuelcast", state: "sleeping", status: "Starts 31 Oct", url: "javascript:alert(1)" },
      ],
      todos: [{ text: "Send the mentor email", project: "vlm-psychophysics", due: "2026-10-16" }, { text: "Claim the voucher" }],
    });
    expect(warnings).toEqual([]);
    expect(body.updated).toBe("2026-10-10");
    expect(body.projects).toEqual([
      { name: "m2-infer", state: "active", status: "Day 3 of 23", next: "GPU bandwidth", url: "https://github.com/x/m2-infer" },
      // An unknown state reads as active; only https links are kept.
      { name: "fuelcast", state: "active", status: "Starts 31 Oct", next: null, url: null },
    ]);
    expect(body.todos).toEqual([
      { text: "Send the mentor email", project: "vlm-psychophysics", due: "2026-10-16" },
      { text: "Claim the voucher", project: null, due: null },
    ]);
  });

  it("drops what can't be shown and keeps a to-do with a bad date, undated", () => {
    const { body, warnings } = checkProjects({
      projects: [{ name: "jobq" }],
      todos: [{ text: "" }, { text: "Open the issue", due: "tomorrow" }],
    });
    expect(body.projects).toEqual([]);
    expect(body.todos).toEqual([{ text: "Open the issue", project: null, due: null }]);
    expect(warnings).toEqual([
      "project 1: needs a name and a status",
      "to-do 1: needs text",
      "to-do 2: due must be YYYY-MM-DD, shown without it",
    ]);
  });
});
