import { describe, expect, it } from "vitest";
import type { PrepTest } from "@/lib/examPrep";
import type { StudyFile } from "@/lib/studyFiles";
import { mayFetch, tomorrowFiles, tomorrowLine } from "@/lib/tomorrow";

const MB = 1024 * 1024;
const file = (path: string, over: Partial<StudyFile> = {}): StudyFile => ({ path, size: MB, mtime: 1, key: `k/${path}`, kind: "notes", subject_code: "21CSC202J", ...over });
const test = (paths: string[]): PrepTest => ({ subject_code: "21CSC204J", due_date: "2026-11-12T09:00:00+05:30", title: "CT-2", topics: [], files: paths.map((path) => ({ path })) });

describe("tomorrow's files", () => {
  const files = [
    file("OS/u1.pdf", { mtime: 1 }),
    file("OS/u2.pdf", { mtime: 3 }),
    file("OS/u3.pdf", { mtime: 4 }),
    file("OS/u4.pdf", { mtime: 2 }),
    file("OS/lab.pdf", { mtime: 9, kind: "lab" }),
    file("DSA/pyq.pdf", { subject_code: "21CSC204J", kind: "pyq" }),
  ];

  it("puts a test's prep files first, then each class's three newest notes", () => {
    const picked = tomorrowFiles({ files, tests: [test(["DSA/pyq.pdf", "gone.pdf"])], courses: ["21CSC 202J"] });
    expect(picked.map((f) => f.path)).toEqual(["DSA/pyq.pdf", "OS/u3.pdf", "OS/u2.pdf", "OS/u4.pdf"]);
  });

  it("keeps within the night's cap, skipping what won't fit, and never twice", () => {
    const big = [file("OS/huge.pdf", { size: 70 * MB, mtime: 9 }), file("OS/a.pdf", { size: 20 * MB, mtime: 8 }), file("OS/b.pdf", { size: 5 * MB, mtime: 7 })];
    expect(tomorrowFiles({ files: big, tests: [test(["OS/b.pdf"])], courses: ["21CSC202J"], cap: 80 * MB }).map((f) => f.path)).toEqual(["OS/b.pdf", "OS/huge.pdf"]);
  });

  it("fetches on Wi-Fi or where the browser can't say, never on cellular or with data saving", () => {
    expect([mayFetch({ type: "wifi" }), mayFetch({ type: "ethernet" }), mayFetch(undefined), mayFetch({})]).toEqual([true, true, true, true]);
    expect([mayFetch({ type: "cellular" }), mayFetch({ type: "wifi", saveData: true })]).toEqual([false, false]);
  });
});

describe("Today's line", () => {
  const state = { date: "2026-11-12", files: 4, ready: 4, bytes: 18 * MB, at: 0 };
  it("names the day the files are for", () => {
    expect(tomorrowLine(state, "2026-11-11")).toBe("Tomorrow's files are on this device");
    expect(tomorrowLine(state, "2026-11-12")).toBe("Today's files are on this device");
    expect(tomorrowLine({ ...state, date: "2026-11-16" }, "2026-11-14")).toBe("Monday's files are on this device");
    expect(tomorrowLine({ ...state, ready: 3 }, "2026-11-11")).toBe("3 of tomorrow's 4 files are on this device");
  });

  it("says nothing once the day has passed, or when nothing was kept", () => {
    expect(tomorrowLine(state, "2026-11-13")).toBeNull();
    expect(tomorrowLine({ ...state, ready: 0 }, "2026-11-11")).toBeNull();
    expect(tomorrowLine(null, "2026-11-11")).toBeNull();
  });
});
