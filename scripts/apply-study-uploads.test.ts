import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyUploads } from "./apply-study-uploads.mjs";

let dir: string;
beforeEach(async () => {
  dir = await realpath(await mkdtemp(path.join(tmpdir(), "uploads-")));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

type Row = { id: number; path: string; key: string; status: string; note?: string };

/** study_uploads rows and the bucket's inbox; the first `failUpdates` status updates fail. */
function fake(rows: Row[], inbox: Record<string, string>, failUpdates = 0) {
  const files = new Map(Object.entries(inbox));
  const query = { eq: () => query, order: async () => ({ data: rows.filter((r) => r.status === "pending"), error: null }) };
  const supabase = {
    from: () => ({
      select: () => query,
      update: (patch: Partial<Row>) => ({
        eq: async (_col: string, id: number) => {
          if (failUpdates-- > 0) return { error: { message: "offline" } };
          Object.assign(rows.find((r) => r.id === id)!, patch);
          return { error: null };
        },
      }),
    }),
    storage: {
      from: () => ({
        download: async (key: string) =>
          files.has(key) ? { data: new Blob([files.get(key)!]), error: null } : { data: null, error: { message: "Object not found" } },
        remove: async (keys: string[]) => (keys.forEach((k) => files.delete(k)), { error: null }),
      }),
    },
  };
  return { supabase, files };
}

const run = (supabase: unknown) => applyUploads({ supabase, pin: "1234", dir, log: () => {} });

describe("saving uploads from the app", () => {
  it("keeps the inbox copy when the status update fails, and the retry saves no second copy", async () => {
    const rows = [{ id: 1, path: "Operating_Systems/notes.pdf", key: "1234/inbox/a", status: "pending" }];
    const { supabase, files } = fake(rows, { "1234/inbox/a": "unit 4" }, 1);

    expect(await run(supabase)).toBe(1);
    expect(rows[0].status).toBe("pending");
    expect(files.has("1234/inbox/a")).toBe(true);

    expect(await run(supabase)).toBe(0);
    expect(rows[0]).toMatchObject({ status: "done", note: "saved" });
    expect(files.has("1234/inbox/a")).toBe(false);
    expect(await readdir(path.join(dir, "Operating_Systems"))).toEqual(["notes.pdf"]);
  });

  it("still saves a different file beside one with the same name", async () => {
    await mkdir(path.join(dir, "Operating_Systems"));
    await writeFile(path.join(dir, "Operating_Systems/notes.pdf"), "unit 3");
    const rows = [{ id: 1, path: "Operating_Systems/notes.pdf", key: "1234/inbox/a", status: "pending" }];
    const { supabase, files } = fake(rows, { "1234/inbox/a": "unit 4" });

    expect(await run(supabase)).toBe(1);
    expect(rows[0]).toMatchObject({ status: "done", note: "saved as Operating_Systems/notes (2).pdf" });
    expect(await readFile(path.join(dir, "Operating_Systems/notes (2).pdf"), "utf8")).toBe("unit 4");
    expect(files.size).toBe(0);
  });
});
