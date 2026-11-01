import { describe, expect, it } from "vitest";
import { buildMoveMap, follower } from "./moved.mjs";

const file = (path: string, sha: string, ext = "pdf") => ({ path, key: `1234/blobs/${sha}.${ext}` });

describe("buildMoveMap", () => {
  it("maps a renamed file to where its contents live now", () => {
    const prev = [file("OS/notes.pdf", "aaa")];
    const now = [file("Operating_Systems/notes.pdf", "aaa")];
    expect([...buildMoveMap(prev, now)]).toEqual([["OS/notes.pdf", "Operating_Systems/notes.pdf"]]);
  });

  it("leaves a path that still exists alone", () => {
    const prev = [file("OS/notes.pdf", "aaa")];
    const now = [file("OS/notes.pdf", "aaa")];
    expect(buildMoveMap(prev, now).size).toBe(0);
  });

  it("doesn't follow a file whose contents are gone (a real delete)", () => {
    const prev = [file("OS/notes.pdf", "aaa")];
    const now = [file("OS/other.pdf", "bbb")];
    expect(buildMoveMap(prev, now).size).toBe(0);
  });

  it("skips a move it can't tell apart: the same contents now at two paths", () => {
    const prev = [file("OS/notes.pdf", "aaa")];
    const now = [file("OS/copy-a.pdf", "aaa"), file("OS/copy-b.pdf", "aaa")];
    expect(buildMoveMap(prev, now).size).toBe(0);
  });

  it("is empty with no previous manifest", () => {
    expect(buildMoveMap(undefined, [file("OS/notes.pdf", "aaa")]).size).toBe(0);
  });
});

describe("follower", () => {
  it("resolves a moved path and records the follow; null for anything else", () => {
    const { resolve, follows } = follower(new Map([["OS/notes.pdf", "Operating_Systems/notes.pdf"]]));
    expect(resolve("OS/notes.pdf")).toBe("Operating_Systems/notes.pdf");
    expect(resolve("OS/gone.pdf")).toBe(null);
    expect(follows).toEqual([["OS/notes.pdf", "Operating_Systems/notes.pdf"]]);
  });
});
