import { describe, expect, it, vi } from "vitest";
import { needsNudge, nudgeViewport } from "@/lib/viewportNudge";

/** A window at `scrollY` whose page is `scrollHeight` tall in a `clientHeight` viewport. Frames run when `frame()` is called. */
function fakeWindow(scrollY: number, scrollHeight: number, clientHeight: number) {
  const frames: FrameRequestCallback[] = [];
  const body = { style: { minHeight: "" } };
  const minHeights: string[] = [];
  const win = {
    scrollY,
    document: { documentElement: { scrollHeight, clientHeight }, body },
    scrollTo: vi.fn(() => minHeights.push(body.style.minHeight)),
    requestAnimationFrame: (cb: FrameRequestCallback) => frames.push(cb),
  };
  return { win: win as unknown as Window, body, minHeights, frame: () => frames.splice(0).forEach((cb) => cb(0)) };
}

describe("nudgeViewport", () => {
  it("scrolls a pixel down and back from the top of a long page", () => {
    const { win, frame } = fakeWindow(0, 2400, 800);
    nudgeViewport(win);
    expect(win.scrollTo).toHaveBeenLastCalledWith({ top: 1, behavior: "instant" });
    frame();
    expect(win.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "instant" });
  });

  it("scrolls a pixel up and back when already scrolled, so the bottom of a page still works", () => {
    const { win, frame } = fakeWindow(1600, 2400, 800);
    nudgeViewport(win);
    expect(win.scrollTo).toHaveBeenLastCalledWith({ top: 1599, behavior: "instant" });
    frame();
    expect(win.scrollTo).toHaveBeenLastCalledWith({ top: 1600, behavior: "instant" });
  });

  it("lends a page too short to scroll one pixel, only for the nudge", () => {
    // A Timetable day with four classes: the page the gap was seen on.
    const { win, body, minHeights, frame } = fakeWindow(0, 790, 790);
    nudgeViewport(win);
    expect(minHeights[0]).toBe("791px");
    frame();
    expect(minHeights[1]).toBe("791px");
    expect(body.style.minHeight).toBe("");
  });

  it("leaves a long page's height alone", () => {
    const { win, body, frame } = fakeWindow(0, 2400, 800);
    nudgeViewport(win);
    frame();
    expect(body.style.minHeight).toBe("");
  });
});

describe("needsNudge", () => {
  it("is only for iOS's home-screen mode", () => {
    expect(needsNudge({ standalone: true })).toBe(true);
    expect(needsNudge({ standalone: false })).toBe(false);
    expect(needsNudge({})).toBe(false);
  });
});
