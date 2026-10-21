import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { autopilotFolders, contentReader, describe as say, filer, loadSeen, logDecision, newInFolders, readNew, whatIsPrompt, whatIsSchema } from "./autopilot.mjs";

const SUBJECTS = [
  { code: "21CSC202J", name: "Operating Systems", short_name: "OS" },
  { code: "21CSC201J", name: "Data Structures and Algorithms", short_name: null },
];
const supabase = { from: () => ({ select: () => ({ eq: async () => ({ data: SUBJECTS, error: null }) }) }) };
const noLog = async () => {};
const pages = async (full: string) => ({ images: [Buffer.from(path.basename(full)).toString("base64")], text: "" });

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "autopilot-test-"));
  await mkdir(path.join(root, "study", "Inbox"), { recursive: true });
});
afterEach(() => rm(root, { recursive: true, force: true }));

const inbox = (name: string, body = name) => writeFile(path.join(root, "study", "Inbox", name), body);

describe("what the model is asked", () => {
  it("names the courses and the kinds, and adds a PDF's text", () => {
    const prompt = whatIsPrompt({ name: "IMG_2041.jpg", text: "Cycle Test II schedule", subjects: SUBJECTS });
    expect(prompt).toContain('saved this file ("IMG_2041.jpg")');
    expect(prompt).toContain("- 21CSC202J: Operating Systems (OS)");
    expect(prompt).toContain("- 21CSC201J: Data Structures and Algorithms\n");
    expect(prompt).toContain('"notice" (an announcement, circular, message or schedule, or a screenshot of one');
    expect(prompt).toMatch(/Text on its first pages: Cycle Test II schedule$/);
  });

  it("holds the course to a code on the list, or null", () => {
    expect(whatIsSchema(SUBJECTS).properties.subject.enum).toEqual(["21CSC202J", "21CSC201J", null]);
  });

  it("says it in one line", () => {
    expect(say({ kind: "notice", subject: "21CSC202J", summary: "OS FT-II on 29 Oct", confidence: 0.923 }, SUBJECTS)).toBe("notice for OS (92%): OS FT-II on 29 Oct");
    expect(say({ kind: "other", subject: null, summary: "a receipt", confidence: 1 }, SUBJECTS)).toBe("other (100%): a receipt");
  });
});

describe("reading the Inbox", () => {
  it("reads each photo and PDF once, a few a tick, and keeps what it found", async () => {
    await inbox("a.jpg");
    await inbox("b.pdf");
    await inbox("c.heic");
    await inbox("notes.txt");
    await inbox(".DS_Store");
    const asked: string[] = [];
    const ask = async ({ images }: { images: string[] }) => {
      asked.push(Buffer.from(images[0], "base64").toString());
      return { kind: "notes", subject: "21CSC202J", summary: "paging", confidence: 0.9 };
    };
    const lines: string[] = [];
    const opts = { decide: noLog, supabase, pin: "1234", dir: path.join(root, "study"), ask, pages, stateDir: path.join(root, "state"), log: (l: string) => lines.push(l), perTick: 2 };

    expect((await readNew(opts)).map((r: { name: string }) => r.name)).toEqual(["a.jpg", "b.pdf"]);
    expect(lines).toEqual(["  Autopilot: Inbox/a.jpg is notes for OS (90%): paging", "  Autopilot: Inbox/b.pdf is notes for OS (90%): paging"]);
    expect((await readNew(opts)).map((r: { name: string }) => r.name)).toEqual(["c.heic"]);
    expect(await readNew(opts)).toEqual([]);
    expect(asked).toEqual(["a.jpg", "b.pdf", "c.heic"]);
    expect(Object.values(await loadSeen(path.join(root, "state"))).map((s) => (s as { name: string }).name)).toEqual(["a.jpg", "b.pdf", "c.heic"]);
  });

  it("knows a file by its content, so a copy isn't read again", async () => {
    await inbox("IMG_1.jpg", "same bytes");
    let calls = 0;
    const ask = async () => (calls++, { kind: "board", subject: null, summary: "a board", confidence: 0.7 });
    const opts = { decide: noLog, supabase, pin: "1234", dir: path.join(root, "study"), ask, pages, stateDir: path.join(root, "state"), log: () => {} };
    await readNew(opts);
    await inbox("IMG_1 (2).jpg", "same bytes");
    await readNew(opts);
    expect(calls).toBe(1);
  });

  it("says when it can't read a file, and tries it again for three ticks", async () => {
    await inbox("broken.pdf");
    const lines: string[] = [];
    const ask = async () => {
      throw new Error("The model's answer didn't fit after 2 tries");
    };
    const opts = { decide: noLog, supabase, pin: "1234", dir: path.join(root, "study"), ask, pages, stateDir: path.join(root, "state"), log: (l: string) => lines.push(l) };
    for (let i = 0; i < 4; i++) expect(await readNew(opts)).toEqual([]);
    expect(lines).toEqual([
      "  Autopilot: couldn't read Inbox/broken.pdf: The model's answer didn't fit after 2 tries",
      "  Autopilot: couldn't read Inbox/broken.pdf: The model's answer didn't fit after 2 tries",
      "  Autopilot: couldn't read Inbox/broken.pdf: The model's answer didn't fit after 2 tries (giving up on it)",
    ]);
  });
});

describe("watched folders", () => {
  it("come from AUTOPILOT_FOLDERS", () => {
    expect(autopilotFolders({ AUTOPILOT_FOLDERS: "~/Downloads, ~/Desktop/WhatsApp ,," }, "/Users/k")).toEqual(["/Users/k/Downloads", "/Users/k/Desktop/WhatsApp"]);
    expect(autopilotFolders({}, "/Users/k")).toEqual([]);
  });

  it("only offer what was saved after Autopilot first saw them, once it has settled", async () => {
    const downloads = path.join(root, "Downloads");
    await mkdir(downloads);
    await writeFile(path.join(downloads, "old.pdf"), "old");
    await new Promise((r) => setTimeout(r, 20));
    const stateDir = path.join(root, "state");
    // First sight: nothing yet, and the time is kept.
    expect(await newInFolders([downloads], { stateDir, now: Date.now() })).toEqual([]);
    await new Promise((r) => setTimeout(r, 20));
    await writeFile(path.join(downloads, "notice.jpg"), "new");
    await writeFile(path.join(downloads, "song.mp3"), "new");
    expect(await newInFolders([downloads], { stateDir, now: Date.now() })).toEqual([]);
    const later = Date.now() + 60_000;
    expect((await newInFolders([downloads], { stateDir, now: later })).map((f: { name: string }) => f.name)).toEqual(["notice.jpg"]);
  });

  it("copy study material into Inbox with its own times, and leave the rest", async () => {
    const downloads = path.join(root, "Downloads");
    await mkdir(downloads);
    const stateDir = path.join(root, "state");
    await newInFolders([downloads], { stateDir, now: Date.now() - 60_000 });
    await writeFile(path.join(downloads, "OS notes.pdf"), "paging");
    await writeFile(path.join(downloads, "receipt.jpg"), "receipt");
    const saved = new Date("2026-10-14T03:30:00Z");
    await utimes(path.join(downloads, "OS notes.pdf"), saved, saved);
    await inbox("OS notes.pdf", "another file with the same name");
    const ask = async ({ images }: { images: string[] }) =>
      Buffer.from(images[0], "base64").toString() === "receipt.jpg"
        ? { kind: "other", subject: null, summary: "a receipt", confidence: 0.95 }
        : { kind: "notes", subject: "21CSC202J", summary: "paging", confidence: 0.9 };
    const lines: string[] = [];
    await readNew({ decide: noLog, supabase, pin: "1234", dir: path.join(root, "study"), folders: [downloads], ask, pages, stateDir, log: (l: string) => lines.push(l), now: Date.now() + 60_000 });

    expect(lines).toContain("  Autopilot: Downloads/OS notes.pdf is notes for OS (90%): paging -> copied to Inbox/OS notes (2).pdf");
    expect(lines).toContain("  Autopilot: Downloads/receipt.jpg is other (95%): a receipt -> left where it is");
    expect((await readdir(path.join(root, "study", "Inbox"))).sort()).toEqual(["OS notes (2).pdf", "OS notes.pdf"]);
    expect((await stat(path.join(root, "study", "Inbox", "OS notes (2).pdf"))).mtime.toISOString()).toBe(saved.toISOString());
    expect(await readdir(downloads)).toHaveLength(2);
  });
});

describe("a notice", () => {
  it("is read for its tests and deadlines, and they are added", async () => {
    await inbox("notice.jpg");
    const writes: string[] = [];
    const tables: Record<string, unknown[]> = { subjects: SUBJECTS.map((s, i) => ({ id: `s${i}`, ...s })), settings: [], timetable_slots: [], deadlines: [] };
    const sb = {
      from: (t: string) => ({
        select: () => ({ eq: async () => ({ data: tables[t] ?? [], error: null }) }),
        insert: () => {
          writes.push(t);
          const result = { data: { id: "a1" }, error: null };
          return Object.assign(Promise.resolve(result), { select: () => ({ single: async () => result }) });
        },
      }),
    };
    const ask = async ({ schema }: { schema: { properties: Record<string, unknown> } }) =>
      "events" in schema.properties
        ? { events: [{ title: "FT-II", type: "exam", subject: "21CSC202J", date: "2026-12-01", time: "10:00", max_marks: 50 }], confidence: 0.9 }
        : { kind: "notice", subject: "21CSC202J", summary: "OS FT-II on 1 Dec", confidence: 0.9 };
    const lines: string[] = [];
    await readNew({ decide: noLog, supabase: sb, pin: "1234", dir: path.join(root, "study"), ask, pages, stateDir: path.join(root, "state"), log: (l: string) => lines.push(l), now: new Date("2026-11-20T06:00:00Z").getTime() });
    expect(lines).toEqual(["  Autopilot: Inbox/notice.jpg is notice for OS (90%): OS FT-II on 1 Dec", "  Autopilot: Added OS FT-II (Tue, 1 Dec)."]);
    expect(writes).toEqual(["autopilot_actions", "deadlines"]);
  });
});

describe("what Autopilot tells the Inbox rules", () => {
  it("is the read when sure, nothing when unsure, and wait for what isn't read yet", async () => {
    await inbox("a-sure.jpg");
    await inbox("b-unsure.jpg");
    await inbox("c-new.jpg");
    await inbox("notes.txt");
    let i = 0;
    const answers = [
      { kind: "notes", subject: "21CSC202J", summary: "paging", confidence: 0.9 },
      { kind: "notes", subject: "21CSC202J", summary: "paging?", confidence: 0.5 },
    ];
    const stateDir = path.join(root, "state");
    await readNew({ decide: noLog, supabase, pin: "1234", dir: path.join(root, "study"), ask: async () => answers[i++], pages, stateDir, log: () => {}, perTick: 2 });
    const full = (n: string) => path.join(root, "study", "Inbox", n);
    const on = await contentReader({ env: {}, stateDir, ready: async () => true });
    expect(await on(full("a-sure.jpg"), "a-sure.jpg")).toMatchObject({ kind: "notes", subject: "21CSC202J" });
    expect(await on(full("b-unsure.jpg"), "b-unsure.jpg")).toBeNull();
    expect(await on(full("c-new.jpg"), "c-new.jpg")).toBe("wait");
    expect(await on(full("notes.txt"), "notes.txt")).toBeNull();
    // Off, or without the model, nothing waits.
    const off = await contentReader({ env: { AUTOPILOT: "off" }, stateDir, ready: async () => true });
    expect(await off(full("c-new.jpg"), "c-new.jpg")).toBeNull();
    const down = await contentReader({ env: {}, stateDir, ready: async () => false });
    expect(await down(full("c-new.jpg"), "c-new.jpg")).toBeNull();
  });
});

describe("the decision log", () => {
  it("has a line for every decision, with how sure the model was", async () => {
    await inbox("notes.jpg");
    await inbox("broken.pdf");
    const downloads = path.join(root, "Downloads");
    await mkdir(downloads);
    const stateDir = path.join(root, "state");
    await newInFolders([downloads], { stateDir, now: Date.now() - 60_000 });
    await writeFile(path.join(downloads, "meme.jpg"), "meme");
    const ask = async ({ images }: { images: string[] }) => {
      const name = Buffer.from(images[0], "base64").toString();
      if (name === "broken.pdf") throw new Error("couldn't open it");
      return name === "meme.jpg" ? { kind: "other", subject: null, summary: "a meme", confidence: 0.99 } : { kind: "notes", subject: "21CSC202J", summary: "paging", confidence: 0.8 };
    };
    const decisions: Record<string, unknown>[] = [];
    await readNew({ supabase, pin: "1234", dir: path.join(root, "study"), folders: [downloads], ask, pages, stateDir, log: () => {}, decide: async (d: Record<string, unknown>) => void decisions.push(d), now: Date.now() + 60_000 });
    const onMove = filer({ supabase, pin: "1234", dir: path.join(root, "study"), decide: async (d: Record<string, unknown>) => void decisions.push(d), log: () => {} });
    await onMove({ name: "notes.jpg", to: "Operating_Systems/02_Notes/notes.jpg", read: { kind: "notes", subject: "21CSC202J", confidence: 0.8 } });
    await onMove({ name: "OS_unit2.pdf", to: "Operating_Systems/02_Notes/Unit_2/OS_unit2.pdf", read: null });
    expect(decisions).toEqual([
      { file: "Inbox/broken.pdf", decision: "failed", error: "couldn't open it" },
      { file: "Inbox/notes.jpg", decision: "read", kind: "notes", subject: "21CSC202J", summary: "paging", confidence: 0.8 },
      { file: "Downloads/meme.jpg", decision: "left where it is", kind: "other", subject: null, summary: "a meme", confidence: 0.99 },
      { file: "Inbox/notes.jpg", decision: "filed to Operating_Systems/02_Notes/notes.jpg", kind: "notes", subject: "21CSC202J", confidence: 0.8 },
    ]);
  });

  it("is JSON lines on the Mac, and moves aside past 2 MB", async () => {
    const file = path.join(root, "logs", "autopilot.jsonl");
    await logDecision({ file: "Inbox/a.jpg", decision: "read", confidence: 0.9 }, file);
    await logDecision({ file: "Inbox/b.jpg", decision: "read", confidence: 0.4 }, file);
    const lines = (await readFile(file, "utf8")).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => [l.file, l.confidence])).toEqual([["Inbox/a.jpg", 0.9], ["Inbox/b.jpg", 0.4]]);
    expect(lines[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await writeFile(file, "x".repeat(2 * 1024 * 1024 + 1));
    await logDecision({ file: "Inbox/c.jpg", decision: "read", confidence: 1 }, file);
    expect((await readdir(path.join(root, "logs"))).sort()).toEqual(["autopilot.1.jsonl", "autopilot.jsonl"]);
    expect((await readFile(file, "utf8")).split("\n").filter(Boolean)).toHaveLength(1);
  });
});
