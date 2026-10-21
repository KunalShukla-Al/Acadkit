import { describe, expect, it } from "vitest";
import { bucketUse, fitUploads, UPLOAD_CAP } from "./storage.mjs";

const MB = 1024 * 1024;

describe("bucketUse", () => {
  it("adds up every file in every folder, page by page", async () => {
    const tree: Record<string, { name: string; id: string | null; metadata?: { size: number } }[]> = {
      "": [{ name: "0404", id: null }, { name: "9999", id: null }],
      "0404": [{ name: "blobs", id: null }, { name: "manifest.json", id: "m", metadata: { size: 2 * MB } }],
      "0404/blobs": Array.from({ length: 1500 }, (_, i) => ({ name: `${i}.pdf`, id: `b${i}`, metadata: { size: 1000 } })),
      "9999": [{ name: "units.json", id: "u", metadata: { size: 500 } }],
    };
    const bucket = {
      list: async (prefix: string, { limit, offset }: { limit: number; offset: number }) => ({ data: (tree[prefix] ?? []).slice(offset, offset + limit), error: null }),
    };
    expect(await bucketUse(bucket)).toBe(2 * MB + 1500 * 1000 + 500);
  });

  it("says which folder it couldn't read", async () => {
    const bucket = { list: async () => ({ data: null, error: { message: "JWT expired" } }) };
    await expect(bucketUse(bucket)).rejects.toThrow("couldn't list the bucket: JWT expired");
  });
});

describe("fitUploads", () => {
  const files = [
    { path: "a.pdf", size: 30 * MB },
    { path: "scan.pdf", size: 45 * MB },
    { path: "b.pdf", size: 5 * MB },
  ];

  it("takes everything while there's room", () => {
    const fit = fitUploads(files, 500 * MB);
    expect(fit.refused).toEqual([]);
    expect(fit.used).toBe(580 * MB);
  });

  it("refuses what would pass 950 MB and still tries the rest", () => {
    const fit = fitUploads(files, UPLOAD_CAP - 40 * MB);
    expect(fit.accepted.map((f) => f.path)).toEqual(["a.pdf", "b.pdf"]);
    expect(fit.refused.map((f) => f.path)).toEqual(["scan.pdf"]);
    expect(fit.used).toBe(UPLOAD_CAP - 5 * MB);
  });

  it("refuses everything once the bucket is past the cap", () => {
    expect(fitUploads(files, 990 * MB).accepted).toEqual([]);
  });
});
