import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SHRINK_OVER, shrinkPdfs, shrunkCopy } from "./shrink.mjs";

const MB = 1024 * 1024;
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "shrink-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A stand-in for Ghostscript that writes `bytes` to the output. */
const gsWriting = (bytes: number) => vi.fn(async (_gs: string, _input: string, out: string) => writeFile(out, Buffer.alloc(bytes)));

describe("shrunkCopy", () => {
  it("keeps a copy that saves at least a quarter, and reuses it", async () => {
    const run = gsWriting(3 * MB);
    expect(await shrunkCopy("/in.pdf", "abc", 42 * MB, { gs: "gs", dir, run })).toEqual({ path: path.join(dir, "abc.pdf"), size: 3 * MB });
    expect(await shrunkCopy("/in.pdf", "abc", 42 * MB, { gs: "gs", dir, run })).toEqual({ path: path.join(dir, "abc.pdf"), size: 3 * MB });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("throws away a copy that saves too little, and never tries that file again", async () => {
    const run = gsWriting(9 * MB);
    expect(await shrunkCopy("/in.pdf", "def", 10 * MB, { gs: "gs", dir, run })).toBeNull();
    expect(await shrunkCopy("/in.pdf", "def", 10 * MB, { gs: "gs", dir, run })).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
    expect(await readdir(dir)).toEqual(["def.skip"]);
  });

  it("falls back to the original when Ghostscript fails", async () => {
    const run = vi.fn(async () => {
      throw new Error("gs exited 1");
    });
    expect(await shrunkCopy("/in.pdf", "ghi", 20 * MB, { gs: "gs", dir, run })).toBeNull();
    expect(await readdir(dir)).toEqual(["ghi.skip"]);
  });
});

describe("shrinkPdfs", () => {
  const files = () => [
    { path: "scan.pdf", ext: "pdf", size: 40 * MB, key: "0404/blobs/aaa.pdf", full: "/scan.pdf" } as Record<string, unknown>,
    { path: "small.pdf", ext: "pdf", size: SHRINK_OVER, key: "0404/blobs/bbb.pdf", full: "/small.pdf" } as Record<string, unknown>,
    { path: "deck.pptx", ext: "pptx", size: 40 * MB, key: "0404/blobs/ccc.pptx", full: "/deck.pptx" } as Record<string, unknown>,
  ];

  it("shrinks only PDFs over 8 MB, and says what it saved", async () => {
    const list = files();
    const lines: string[] = [];
    expect(await shrinkPdfs(list, { gs: "gs", dir, run: gsWriting(4 * MB), log: (l: string) => lines.push(l) })).toBe(36 * MB);
    expect(list[0]).toMatchObject({ upload: path.join(dir, "aaa.pdf"), uploadSize: 4 * MB });
    expect(list[1].upload).toBeUndefined();
    expect(list[2].upload).toBeUndefined();
    expect(lines).toEqual(["Big PDFs: 1 over 8 MB, 1 shrunk for upload, 36.0 MB saved"]);
  });

  it("shrinks smaller ones too when asked, as at night", async () => {
    const list = files();
    const lines: string[] = [];
    await shrinkPdfs(list, { gs: "gs", over: 2 * MB, dir, run: gsWriting(1 * MB), log: (l: string) => lines.push(l) });
    expect(list[1]).toMatchObject({ upload: path.join(dir, "bbb.pdf"), uploadSize: 1 * MB });
    expect(lines).toEqual(["Big PDFs: 2 over 2 MB, 2 shrunk for upload, 46.0 MB saved"]);
  });

  it("says when Ghostscript isn't there", async () => {
    expect(await shrinkPdfs(files(), { gs: null })).toBeNull();
  });
});
