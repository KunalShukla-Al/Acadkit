import { describe, expect, it } from "vitest";
import {
  DELETED_TTL,
  deletedFiles,
  hiddenKeys,
  markDeleted,
  pruneDeleted,
  subscribeDeletedFiles,
  unmarkDeleted,
  unsentDeletes,
  visibleFiles,
  type DeletedFile,
  type DeletionRow,
} from "./deletedFiles";

const NOW = Date.parse("2026-11-27T10:40:00Z");
const file = (path: string, key = `k-${path}`) => ({ path, key });
const entry = (path: string, at = NOW - 60_000, key = `k-${path}`): DeletedFile => ({ path, key, at });
const row = (path: string, status: DeletionRow["status"], doneAt: number | null = null, key = `k-${path}`): DeletionRow => ({
  path,
  key,
  status,
  done_at: doneAt === null ? null : new Date(doneAt).toISOString(),
});

describe("hiddenKeys", () => {
  it("hides open and finished requests on every device", () => {
    const hidden = hiddenKeys([], [row("a.pdf", "pending"), row("b.pdf", "done", NOW - 1000)], NOW);
    expect([...hidden.keys()].sort()).toEqual(["a.pdf", "b.pdf"]);
  });

  it("shows a file the Mac turned down", () => {
    expect(hiddenKeys([], [row("a.pdf", "skipped", NOW)], NOW).size).toBe(0);
  });

  it("hides this device's deletes before the server has them", () => {
    expect(hiddenKeys([entry("a.pdf")], [], NOW).get("a.pdf")).toBe("k-a.pdf");
  });

  it("lets an entry go once it expires", () => {
    expect(hiddenKeys([entry("a.pdf", NOW - DELETED_TTL - 1)], [], NOW).size).toBe(0);
  });

  it("shows the file when the Mac kept it after this delete, not before", () => {
    const at = NOW - 60_000;
    expect(hiddenKeys([entry("a.pdf", at)], [row("a.pdf", "skipped", at + 1000)], NOW).size).toBe(0);
    expect(hiddenKeys([entry("a.pdf", at)], [row("a.pdf", "skipped", at - 1000)], NOW).size).toBe(1);
  });
});

describe("visibleFiles", () => {
  it("drops deleted files from an older manifest", () => {
    // The Mac has finished, but this phone's manifest still lists the file.
    const hidden = hiddenKeys([], [row("OS/a.pdf", "done", NOW - 1000)], NOW);
    expect(visibleFiles([file("OS/a.pdf"), file("OS/b.pdf")], hidden)).toEqual([file("OS/b.pdf")]);
  });

  it("shows a new file saved under a deleted file's name", () => {
    const hidden = hiddenKeys([entry("a.pdf")], [], NOW);
    expect(visibleFiles([file("a.pdf", "new-key")], hidden)).toEqual([file("a.pdf", "new-key")]);
  });
});

describe("pruneDeleted", () => {
  it("keeps an entry only while the manifest lists that same file", () => {
    const local = [entry("gone.pdf"), entry("listed.pdf"), entry("replaced.pdf")];
    const files = [file("listed.pdf"), file("replaced.pdf", "new-key")];
    expect(pruneDeleted(local, files, [], NOW).map((d) => d.path)).toEqual(["listed.pdf"]);
  });

  it("drops expired entries and ones the Mac turned down", () => {
    const local = [entry("old.pdf", NOW - DELETED_TTL - 1), entry("kept.pdf")];
    const files = [file("old.pdf"), file("kept.pdf")];
    expect(pruneDeleted(local, files, [row("kept.pdf", "skipped", NOW)], NOW)).toEqual([]);
  });
});

describe("unsentDeletes", () => {
  const files = [file("a.pdf"), file("b.pdf"), file("c.pdf"), file("d.pdf")];

  it("resends only deletes the server has no request for", () => {
    const local = [entry("a.pdf"), entry("b.pdf"), entry("c.pdf"), entry("d.pdf"), entry("gone.pdf")];
    const rows = [row("b.pdf", "pending"), row("c.pdf", "done", NOW), row("d.pdf", "skipped", NOW - 120_000)];
    // a: never sent. d: only an older request the Mac turned down. gone: no longer listed.
    expect(unsentDeletes(local, files, rows).map((d) => d.path)).toEqual(["a.pdf", "d.pdf"]);
  });
});

describe("the device's record", () => {
  it("adds, replaces and removes entries, telling subscribers", () => {
    let calls = 0;
    const stop = subscribeDeletedFiles(() => calls++);
    markDeleted("pin-1", [file("a.pdf"), file("b.pdf")], NOW);
    markDeleted("pin-1", [file("a.pdf", "k2")], NOW + 1);
    expect(deletedFiles("pin-1")).toEqual([entry("b.pdf", NOW), entry("a.pdf", NOW + 1, "k2")]);
    unmarkDeleted("pin-1", ["a.pdf", "b.pdf"]);
    expect(deletedFiles("pin-1")).toEqual([]);
    expect(deletedFiles("pin-2")).toEqual([]);
    stop();
    expect(calls).toBe(3);
  });

  it("returns the same array until it changes", () => {
    markDeleted("pin-3", [file("a.pdf")], NOW);
    expect(deletedFiles("pin-3")).toBe(deletedFiles("pin-3"));
  });
});
