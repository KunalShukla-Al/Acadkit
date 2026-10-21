import { describe, expect, it } from "vitest";
import { notesFor, VERSION } from "@/lib/release";

describe("release", () => {
  it("points a version at its notes, the release whose tag the Release workflow makes", () => {
    expect(notesFor("1.0.0")).toBe("https://github.com/KunalShukla-Al/Acadkit/releases/tag/v1.0.0");
  });

  it("is a test build outside Vite", () => {
    expect(VERSION).toBe("test");
  });
});
