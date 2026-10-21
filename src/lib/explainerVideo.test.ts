import { describe, expect, it } from "vitest";
import { videoType, wrapWords } from "@/lib/explainerVideo";

describe("an explainer as a video", () => {
  it("records MP4 where the browser can, else WebM, else not at all", () => {
    expect(videoType((t) => t.startsWith("video/mp4"))).toEqual({ mime: "video/mp4;codecs=avc1", ext: "mp4" });
    expect(videoType((t) => t === "video/webm")).toEqual({ mime: "video/webm", ext: "webm" });
    expect(videoType(() => false)).toBeNull();
  });

  it("wraps the caption to the frame's width", () => {
    const measure = (s: string) => s.length * 10;
    expect(wrapWords("That's 42 of 50, or 84.0%.", 120, measure)).toEqual(["That's 42 of", "50, or", "84.0%."]);
    expect(wrapWords("", 120, measure)).toEqual([]);
  });
});
