import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { endAccount } from "@/lib/account";

// Everything the run reads, answered at once; what it decides to keep is two files.
vi.mock("@/api/deadlines", () => ({ fetchDeadlines: async () => [] }));
vi.mock("@/api/settings", () => ({ fetchSettings: async () => null }));
vi.mock("@/api/subjects", () => ({ fetchSubjects: async () => [] }));
vi.mock("@/api/timetable", () => ({ fetchTimetable: async () => [] }));
vi.mock("@/lib/examPrep", () => ({ upcomingPrep: () => [] }));
vi.mock("@acadkit/core/calendar", () => ({ nextWorkingDate: () => ({ date: "2026-11-26" }), semesterWindow: () => null }));
vi.mock("@acadkit/core/today", () => ({ today: () => ({ classes: [] }) }));
const files = [
  { key: "pin/a.pdf", path: "FDS/a.pdf", size: 10 },
  { key: "pin/b.pdf", path: "FDS/b.pdf", size: 10 },
];
const writeTomorrow = vi.fn();
vi.mock("@/lib/tomorrow", () => ({ tomorrowFiles: () => files, writeTomorrow: (s: unknown) => writeTomorrow(s) }));
const keepStudyFile = vi.fn();
vi.mock("@/api/studyFiles", () => ({
  fetchStudyManifest: async () => ({ files }),
  fetchStudyPrep: async () => null,
  keepStudyFile: (...a: unknown[]) => keepStudyFile(...a),
}));

describe("keepTomorrow across a sign-out", () => {
  it("keeps every file and saves the summary while signed in", async () => {
    const { keepTomorrow } = await import("@/lib/tomorrowOffline");
    keepStudyFile.mockReset().mockResolvedValue(true);
    writeTomorrow.mockReset();
    const state = await keepTomorrow("pin", new QueryClient(), new Date("2026-11-25T19:00:00"));
    expect(keepStudyFile).toHaveBeenCalledTimes(2);
    expect(state).toMatchObject({ date: "2026-11-26", files: 2, ready: 2 });
    expect(writeTomorrow).toHaveBeenCalledOnce();
  });

  it("stops before the next file, and saves nothing, once the account signs out", async () => {
    const { keepTomorrow } = await import("@/lib/tomorrowOffline");
    keepStudyFile.mockReset().mockImplementation(async () => {
      endAccount();
      return true;
    });
    writeTomorrow.mockReset();
    const state = await keepTomorrow("pin", new QueryClient(), new Date("2026-11-25T19:00:00"));
    expect(state).toBeNull();
    expect(keepStudyFile).toHaveBeenCalledTimes(1);
    expect(writeTomorrow).not.toHaveBeenCalled();
  });
});
