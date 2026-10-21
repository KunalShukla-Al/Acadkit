import { afterEach, describe, expect, it, vi } from "vitest";
import { readHiddenNotices, writeHiddenNotices } from "@/lib/hiddenNotices";

const NOW = new Date("2026-10-10T10:00:00+05:30").getTime();

describe("hidden notices", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("keeps swiped notices per PIN and forgets them after their last day", () => {
    writeHiddenNotices("1234", { "a|old": "2026-10-09", "b|live": "2026-10-12" }, NOW);
    expect(readHiddenNotices("1234")).toEqual({ "b|live": "2026-10-12" });
    expect(readHiddenNotices("9999")).toEqual({});
  });

  it("hides nothing when storage holds junk or throws", () => {
    localStorage.setItem("acadkit:hidden-notices:1234", "[1,2]");
    expect(readHiddenNotices("1234")).toEqual({});
    // A stand-in, not Storage.prototype: Node 22 (CI) has no Storage global, only the setup's polyfill.
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("disabled");
      },
    });
    expect(readHiddenNotices("1234")).toEqual({});
  });
});
