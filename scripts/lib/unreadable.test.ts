import { describe, expect, it } from "vitest";
import { isUnreadable, keepLastUpload } from "./unreadable.mjs";

const prev = [
  { path: "OS/notes.pdf", key: "1234/blobs/aaa.pdf", size: 10 },
  { path: "OS/old.pdf", key: "1234/blobs/bbb.pdf", size: 20 },
];

describe("keepLastUpload", () => {
  it("keeps the last upload while its blob is still in the bucket", () => {
    const kept = keepLastUpload("OS/notes.pdf", prev, new Set(["1234/blobs/aaa.pdf"]));
    expect(kept).toEqual({ path: "OS/notes.pdf", key: "1234/blobs/aaa.pdf", size: 10, full: null, kept: true });
  });

  it("keeps nothing for a file the last sync didn't have", () => {
    expect(keepLastUpload("OS/new.pdf", prev, new Set(["1234/blobs/aaa.pdf"]))).toBeNull();
  });

  it("keeps nothing when the blob is already gone from the bucket", () => {
    expect(keepLastUpload("OS/old.pdf", prev, new Set(["1234/blobs/aaa.pdf"]))).toBeNull();
  });

  it("copes with no previous manifest", () => {
    expect(keepLastUpload("OS/notes.pdf", undefined, new Set())).toBeNull();
  });
});

describe("isUnreadable", () => {
  it("treats the iCloud placeholder error as unreadable", () => {
    expect(isUnreadable(Object.assign(new Error("Unknown system error -11"), { code: "Unknown system error -11" }))).toBe(true);
    expect(isUnreadable(Object.assign(new Error("deadlock"), { code: "EDEADLK" }))).toBe(true);
  });

  it("treats a file deleted mid-sync as gone, not unreadable", () => {
    expect(isUnreadable(Object.assign(new Error("gone"), { code: "ENOENT" }))).toBe(false);
  });
});
