import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyDeletions } from "./apply-study-deletions.mjs";

let dir: string;
let trash: string;
beforeEach(async () => {
  const tmp = await realpath(await mkdtemp(path.join(tmpdir(), "deletions-")));
  dir = path.join(tmp, "study");
  trash = path.join(tmp, "Trash");
  await mkdir(path.join(dir, "Operating_Systems"), { recursive: true });
  await mkdir(trash);
});
afterEach(async () => {
  await chmod(path.join(dir, "Operating_Systems"), 0o755).catch(() => {});
  await rm(path.dirname(dir), { recursive: true, force: true });
});

type Row = { id: number; path: string; key: string; status: string; note?: string };

const keyOf = (text: string) => `1234/blobs/${createHash("sha256").update(text).digest("hex")}.pdf`;

/** study_file_deletions rows; the first `failUpdates` status updates fail. */
function fake(rows: Row[], failUpdates = 0) {
  const query = { eq: () => query, order: async () => ({ data: rows.filter((r) => r.status === "pending"), error: null }) };
  return {
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
  };
}

const run = (supabase: unknown) => applyDeletions({ supabase, pin: "1234", dir, trash, log: () => {} });

describe("acting on deletions from the app", () => {
  it("leaves the request pending when the status update fails, and the retry records the move", async () => {
    await writeFile(path.join(dir, "Operating_Systems/notes.pdf"), "unit 4");
    const rows = [{ id: 1, path: "Operating_Systems/notes.pdf", key: keyOf("unit 4"), status: "pending" }];
    const supabase = fake(rows, 1);

    expect(await run(supabase)).toBe(1);
    expect(rows[0].status).toBe("pending");
    expect(await readdir(trash)).toEqual(["notes.pdf"]);

    expect(await run(supabase)).toBe(0);
    expect(rows[0]).toMatchObject({ status: "done", note: "moved to the Trash as notes.pdf" });
    expect(await readdir(trash)).toEqual(["notes.pdf"]);
  });

  it("finds its copy by bytes past a different file of the same name", async () => {
    await writeFile(path.join(trash, "notes.pdf"), "someone else's");
    await writeFile(path.join(trash, "notes (AcadKit 2).pdf"), "unit 4");
    const rows = [{ id: 1, path: "Operating_Systems/notes.pdf", key: keyOf("unit 4"), status: "pending" }];

    await run(fake(rows));
    expect(rows[0]).toMatchObject({ status: "done", note: "moved to the Trash as notes (AcadKit 2).pdf" });
  });

  it("moves a source the earlier run left behind", async () => {
    await writeFile(path.join(trash, "notes.pdf"), "unit 4");
    await mkdir(path.join(dir, "_src/Operating_Systems"), { recursive: true });
    await writeFile(path.join(dir, "_src/Operating_Systems/notes.md"), "# Unit 4");
    const rows = [{ id: 1, path: "Operating_Systems/notes.pdf", key: keyOf("unit 4"), status: "pending" }];

    await run(fake(rows));
    expect(rows[0]).toMatchObject({ status: "done", note: "moved to the Trash as notes.pdf and its source notes.md" });
    expect((await readdir(trash)).sort()).toEqual(["notes.md", "notes.pdf"]);
  });

  it("marks a file missing from the Mac and the Trash as already gone", async () => {
    const rows = [{ id: 1, path: "Operating_Systems/notes.pdf", key: keyOf("unit 4"), status: "pending" }];

    await run(fake(rows));
    expect(rows[0]).toMatchObject({ status: "done", note: "already gone from the Mac" });
  });

  it("keeps the request pending when the file can't be checked", async () => {
    await writeFile(path.join(dir, "Operating_Systems/notes.pdf"), "unit 4");
    await chmod(path.join(dir, "Operating_Systems"), 0o000);
    const rows = [{ id: 1, path: "Operating_Systems/notes.pdf", key: keyOf("unit 4"), status: "pending" }];

    expect(await run(fake(rows))).toBe(0);
    expect(rows[0].status).toBe("pending");
    expect(await readdir(trash)).toEqual([]);
  });
});
