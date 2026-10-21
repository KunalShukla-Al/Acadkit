import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contentReader, readNew } from "./autopilot.mjs";
import { fileInbox } from "./inbox.mjs";
import recorded from "./__fixtures__/autopilot-replies.json";

/**
 * Autopilot end to end on what the real model said about six of my files
 * (npm run autopilot:record): what each is, the deadlines a notice adds,
 * and where Inbox files them. A re-recording that changes an answer shows
 * up here.
 */

const FOLDERS: [string, string, string][] = [
  ["Operating_Systems", "21CSC202J", "Operating Systems"],
  ["Data_Structures_and_Algorithms", "21CSC201J", "Data Structures and Algorithms"],
  ["Advanced_Object_Oriented_Programming", "21CSC203P", "Advanced Object Oriented Programming"],
  ["Transforms_and_Boundary_Value_Problems", "21MAB201T", "Transforms and Boundary Value Problems"],
  ["Fundamentals_of_Data_Science", "21CSS202T", "Fundamentals of Data Science"],
];
type Case = { name: string; whatIs: Record<string, unknown>; notice?: Record<string, unknown> };
const cases = recorded.cases as Case[];

let root: string;
const study = () => path.join(root, "study");
const inserted: Record<string, Record<string, unknown>[]> = {};
const tables: Record<string, unknown[]> = {
  subjects: recorded.subjects,
  settings: [{ sem_start: "2026-07-21", sem_end: "2026-11-18", declared_holidays: [] }],
  timetable_slots: [],
  deadlines: [],
};
const supabase = {
  from: (table: string) => ({
    select: () => ({ eq: async () => ({ data: tables[table] ?? [], error: null }) }),
    insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
      (inserted[table] ??= []).push(...[rows].flat());
      const result = { data: { id: "action-1" }, error: null };
      return Object.assign(Promise.resolve(result), { select: () => ({ single: async () => result }) });
    },
  }),
};
/** The recorded reply for the file named in the "image", to the question the schema asks. */
const ask = async ({ images, schema }: { images: string[]; schema: { properties: Record<string, unknown> } }) => {
  const c = cases.find((x) => x.name === Buffer.from(images[0], "base64").toString())!;
  return "events" in schema.properties ? c.notice : c.whatIs;
};
const pages = async (full: string) => ({ images: [Buffer.from(path.basename(full)).toString("base64")], text: "" });
const reads: { name: string; kind: string; subject: string | null }[] = [];

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "autopilot-replay-"));
  await mkdir(path.join(study(), "Inbox"), { recursive: true });
  await mkdir(path.join(study(), "_src"));
  await writeFile(path.join(study(), "_src", "acadkit_curriculum.json"), JSON.stringify({ semesters: [{ courses: FOLDERS.map(([, code, title]) => ({ code, title })) }] }));
  for (const [folder] of FOLDERS) await mkdir(path.join(study(), folder));
  for (const c of cases) await writeFile(path.join(study(), "Inbox", c.name), c.name);
  const stateDir = path.join(root, "state");
  reads.push(...(await readNew({ supabase, pin: "1234", dir: study(), ask, pages, stateDir, log: () => {}, decide: async () => {}, perTick: 10, now: new Date(`${recorded.today}T06:00:00Z`).getTime() })));
  await fileInbox({ supabase, pin: "1234", dir: study(), log: () => {}, readOf: await contentReader({ env: {}, stateDir, ready: async () => true }) });
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe("Autopilot on recorded replies", () => {
  it("says what each file is", () => {
    expect(Object.fromEntries(reads.map((r) => [r.name, `${r.kind} ${r.subject ?? "-"}`]))).toEqual({
      "IMG_2041.png": "notice 21CSS202T",
      "IMG_2042.jpg": "question-paper 21CSC203P",
      "notes_from_whatsapp.pdf": "notice 21CSC202J",
      "Unit2_Fourier_Series_Slides.pdf": "slides 21MAB201T",
      "Assignment-1.pdf": "assignment 21MAB201T",
      "IMG_2043.png": "other -",
    });
  });

  it("adds the end-sem papers and the test still ahead, and skips what's past", () => {
    const day = (iso: unknown) => new Date(String(iso)).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    expect(inserted.deadlines.map((d) => `${d.subject_id} ${d.title} ${day(d.due_date)} ${d.source}`)).toEqual([
      "tbvp End semester exam 2026-11-25 Inbox/IMG_2041.png",
      "fds End semester exam 2026-11-26 Inbox/IMG_2041.png",
      "dsa End semester exam 2026-11-27 Inbox/IMG_2041.png",
      "os End semester exam 2026-11-30 Inbox/IMG_2041.png",
      "os OS CT-1 = FT-II written 2026-10-29 Inbox/notes_from_whatsapp.pdf",
    ]);
    expect(inserted.autopilot_actions.map((a) => a.said)).toEqual([
      "Added TBVP End semester exam (Wed, 25 Nov), FDS End semester exam (Thu, 26 Nov), DSA End semester exam (Fri, 27 Nov) and OS End semester exam (Mon, 30 Nov).",
      "Added OS CT-1 = FT-II written (Thu, 29 Oct).",
    ]);
  });

  it("files study material by what it shows, and leaves notices and the rest in Inbox", async () => {
    const list = async (rel: string) => (await readdir(path.join(study(), rel)).catch(() => [])).sort();
    expect(await list("Inbox")).toEqual(["IMG_2041.png", "IMG_2043.png", "notes_from_whatsapp.pdf"]);
    expect(await list("Advanced_Object_Oriented_Programming/07_PYQs")).toEqual(["IMG_2042.jpg"]);
    expect(await list("Transforms_and_Boundary_Value_Problems/02_Notes/Unit_2")).toEqual(["Unit2_Fourier_Series_Slides.pdf"]);
    expect(await list("Transforms_and_Boundary_Value_Problems/03_Assignments_Tutorials")).toEqual(["Assignment-1.pdf"]);
  });
});
