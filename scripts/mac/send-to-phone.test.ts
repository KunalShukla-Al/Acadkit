import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { placeForPhone, sendToPhone, sentMessage } from "./send-to-phone.mjs";

let root: string;
let study: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "send-"));
  study = path.join(root, "study");
  await mkdir(path.join(study, "Operating_Systems"), { recursive: true });
  await writeFile(path.join(study, "Operating_Systems", "notes.pdf"), "in the folder");
  await writeFile(path.join(root, "Desktop notes.pdf"), "from the desktop");
  await mkdir(path.join(study, "Inbox"));
  await writeFile(path.join(study, "Inbox", "Desktop notes.pdf"), "already there");
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("sending files from the Finder to the phone", () => {
  it("leaves study-folder files where they are and copies the rest into Inbox, under a free name", async () => {
    const placed = await placeForPhone([path.join(study, "Operating_Systems", "notes.pdf"), path.join(root, "Desktop notes.pdf"), study], study);
    expect(placed).toEqual([
      { rel: "Operating_Systems/notes.pdf", copied: false },
      { rel: "Inbox/Desktop notes (2).pdf", copied: true },
    ]);
    expect(await readFile(path.join(study, "Inbox", "Desktop notes (2).pdf"), "utf8")).toBe("from the desktop");
  });

  it("makes the last one where you're reading, from the computer", async () => {
    const sent: Record<string, unknown>[] = [];
    const supabase = { from: () => ({ upsert: async (row: Record<string, unknown>) => (sent.push(row), { error: null }) }) };
    const line = await sendToPhone({ files: [path.join(study, "Operating_Systems", "notes.pdf")], dir: study, supabase, pin: "1234" });
    expect(sent[0]).toMatchObject({ device_id: "1234", path: "Operating_Systems/notes.pdf", page: null, kind: "computer" });
    expect(line).toBe("notes.pdf is on your phone: AcadKit there offers it.");
  });

  it("says when a copy waits for the sync, or there was nothing to send", () => {
    expect(sentMessage([{ rel: "a.pdf", copied: false }, { rel: "Inbox/b.pdf", copied: true }])).toBe("b.pdf and 1 more goes to your phone at the next sync, in Inbox. AcadKit there offers it.");
    expect(sentMessage([])).toBe("Nothing to send: pick files, not folders.");
  });
});
