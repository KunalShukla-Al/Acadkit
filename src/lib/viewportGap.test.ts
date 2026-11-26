import { describe, expect, it } from "vitest";
import { viewportGap, type Measure } from "@/lib/viewportGap";

/** An iPhone 15 Pro in the home-screen app, portrait, with a full-screen viewport. */
const phone: Measure = {
  standalone: true,
  landscape: false,
  screenWidth: 393,
  screenHeight: 852,
  innerWidth: 393,
  viewportHeight: 852,
  topInset: 59,
};

describe("viewportGap", () => {
  it("is 0 when the viewport reaches the screen's foot", () => {
    expect(viewportGap(phone)).toBe(0);
  });

  it("is the shortfall when the app opens a status bar short", () => {
    // The tab bar seen 59px above the edge on 26 Nov.
    expect(viewportGap({ ...phone, viewportHeight: 793 })).toBe(59);
  });

  it("rounds to whole px", () => {
    expect(viewportGap({ ...phone, viewportHeight: 792.67 })).toBe(59);
  });

  it("ignores a shortfall bigger than the status bar, like the keyboard", () => {
    expect(viewportGap({ ...phone, viewportHeight: 520 })).toBe(0);
  });

  it("ignores a page that starts below the status bar, whose foot is the screen's", () => {
    expect(viewportGap({ ...phone, viewportHeight: 793, topInset: 0 })).toBe(0);
  });

  it("ignores a viewport taller than the screen", () => {
    expect(viewportGap({ ...phone, viewportHeight: 900 })).toBe(0);
  });

  it("is only for iOS's home-screen mode", () => {
    expect(viewportGap({ ...phone, standalone: false, viewportHeight: 793 })).toBe(0);
  });

  it("uses the screen's short side for height in landscape", () => {
    const landscape = { ...phone, landscape: true, innerWidth: 852, topInset: 0 };
    expect(viewportGap({ ...landscape, viewportHeight: 393 })).toBe(0);
    expect(viewportGap({ ...landscape, viewportHeight: 373, topInset: 20 })).toBe(20);
  });

  it("leaves a window narrower than the screen alone, like an iPad side by side", () => {
    const ipad = { ...phone, screenWidth: 820, screenHeight: 1180, innerWidth: 507, viewportHeight: 1150, topInset: 24 };
    expect(viewportGap(ipad)).toBe(0);
  });
});
