import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classAt, destinationFor, fileInbox, foldersByCode, istClock, subjectInName } from "./inbox.mjs";

const subject = (code: string, name: string, short_name: string | null = null) => ({ id: code, device_id: "1234", code, name, short_name, credits: 4, type: "theory", faculty: null, color_hex: "#000" });
const SUBJECTS = [subject("21CSC202J", "Operating Systems"), subject("21CSC201J", "Data Structures and Algorithms"), subject("21MAB201T", "Transforms and Boundary Value Problems", "TBVP")];
const folderOf = foldersByCode(
  new Map([
    ["Operating_Systems", "21CSC202J"],
    ["Data_Structures_and_Algorithms", "21CSC201J"],
    ["Data_Structures_and_Algorithms_Lab", "21CSC201J"],
    ["Transforms_and_Boundary_Value_Problems", "21MAB201T"],
  ])
);
const CLASSES = [
  { start: "08:00", end: "08:50", code: "21CSC202J", type: "theory" },
  { start: "10:00", end: "11:40", code: "21CSC201J", type: "lab" },
];
const at = (time: string) => ({ date: "2026-10-21", time });
const dest = (name: string, time = "16:00") => destinationFor({ name, at: at(time), classes: CLASSES, subjects: SUBJECTS, folderOf });

describe("filing the Inbox", () => {
  it("files by a subject named in the file, into its unit when the name says one", () => {
    expect(dest("OS_unit3_scheduling.pdf")).toBe("Operating_Systems/02_Notes/Unit_3/OS_unit3_scheduling.pdf");
    expect(dest("21MAB201T fourier.pdf")).toBe("Transforms_and_Boundary_Value_Problems/02_Notes/21MAB201T fourier.pdf");
    expect(dest("TBVP formulae.jpg")).toBe("Transforms_and_Boundary_Value_Problems/02_Notes/TBVP formulae.jpg");
  });

  it("files a photo taken in class with that class, by date", () => {
    expect(dest("IMG_4021.heic", "08:35")).toBe("Operating_Systems/02_Notes/Class_Photos/2026-10-21/IMG_4021.heic");
    // Ten minutes after it ends still counts; a lab class goes to the lab's folder.
    expect(dest("IMG_4022.heic", "08:59")).toBe("Operating_Systems/02_Notes/Class_Photos/2026-10-21/IMG_4022.heic");
    expect(dest("IMG_4023.heic", "11:00")).toBe("Data_Structures_and_Algorithms_Lab/02_Notes/Class_Photos/2026-10-21/IMG_4023.heic");
  });

  it("leaves what it can't place", () => {
    expect(dest("IMG_4024.heic", "09:30")).toBeNull();
    expect(dest("receipt.pdf")).toBeNull();
    // "OS" inside a word names nothing.
    expect(subjectInName("photos.pdf", SUBJECTS)).toBeNull();
    expect(subjectInName("COSMOS.pdf", SUBJECTS)).toBeNull();
  });

  it("files what Autopilot is sure of by what it shows, before the class on then", () => {
    const read = (kind: string, subject: string | null = null) => ({ kind, subject });
    const by = (name: string, time: string, r: ReturnType<typeof read>) => destinationFor({ name, at: at(time), classes: CLASSES, subjects: SUBJECTS, folderOf, read: r });
    // DSA notes photographed in the OS class are DSA's.
    expect(by("IMG_1.jpg", "08:30", read("notes", "21CSC201J"))).toBe("Data_Structures_and_Algorithms/02_Notes/IMG_1.jpg");
    expect(by("IMG_2 unit 3.jpg", "16:00", read("slides", "21CSC202J"))).toBe("Operating_Systems/02_Notes/Unit_3/IMG_2 unit 3.jpg");
    // A board with no course on it is the class's; in the lab, the lab's.
    expect(by("IMG_3.jpg", "08:30", read("board"))).toBe("Operating_Systems/02_Notes/Class_Photos/2026-10-21/IMG_3.jpg");
    expect(by("IMG_4.jpg", "10:30", read("board", "21CSC201J"))).toBe("Data_Structures_and_Algorithms_Lab/02_Notes/Class_Photos/2026-10-21/IMG_4.jpg");
    expect(by("paper.pdf", "16:00", read("question-paper", "21CSC202J"))).toBe("Operating_Systems/07_PYQs/paper.pdf");
    expect(by("sheet.pdf", "16:00", read("assignment", "21MAB201T"))).toBe("Transforms_and_Boundary_Value_Problems/03_Assignments_Tutorials/sheet.pdf");
    // A notice, a receipt, or a board with no course out of class hours, stays.
    expect(by("notice.jpg", "08:30", read("notice", "21CSC202J"))).toBeNull();
    expect(by("IMG_5.jpg", "08:30", read("other"))).toBeNull();
    expect(by("IMG_6.jpg", "16:00", read("board"))).toBeNull();
    // A portal screenshot, once read into the app, goes where the sync never looks.
    expect(by("IMG_7.PNG", "08:30", read("portal"))).toBe("_portal/2026-10-21/IMG_7.PNG");
    // The name still comes first.
    expect(by("OS_unit2.pdf", "08:30", read("notes", "21CSC201J"))).toBe("Operating_Systems/02_Notes/Unit_2/OS_unit2.pdf");
  });

  it("finds the class on at a time", () => {
    expect(classAt(CLASSES, "07:59")).toBeNull();
    expect(classAt(CLASSES, "10:00")?.code).toBe("21CSC201J");
  });

  it("reads the time in IST", () => {
    expect(istClock(new Date("2026-10-21T03:05:00Z"))).toEqual({ date: "2026-10-21", time: "08:35" });
  });
});

describe("fileInbox", () => {
  it("moves what it can place out of the study folder's Inbox, and leaves the rest", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "inbox-"));
    try {
      await mkdir(path.join(dir, "Inbox"), { recursive: true });
      await mkdir(path.join(dir, "Operating_Systems", "02_Notes", "Unit_2"), { recursive: true });
      await mkdir(path.join(dir, "_src"));
      await writeFile(path.join(dir, "_src", "acadkit_curriculum.json"), JSON.stringify({ semesters: [{ courses: [{ code: "21CSC202J", title: "Operating Systems" }] }] }));
      await writeFile(path.join(dir, "Operating_Systems", "02_Notes", "Unit_2", "OS_unit2.pdf"), "already here");
      await writeFile(path.join(dir, "Inbox", "OS_unit2.pdf"), "shared");
      await writeFile(path.join(dir, "Inbox", "random.jpg"), "x");
      const table = (data: unknown[]) => ({ select: () => ({ eq: async () => ({ data, error: null }) }) });
      const supabase = { from: (t: string) => table(t === "subjects" ? SUBJECTS : []) };
      const lines: string[] = [];
      expect(await fileInbox({ supabase, pin: "1234", dir, log: (l: string) => lines.push(l) })).toBe(1);
      // Never over a file that is there already.
      expect(await readdir(path.join(dir, "Operating_Systems", "02_Notes", "Unit_2"))).toEqual(["OS_unit2 (2).pdf", "OS_unit2.pdf"]);
      expect(await readdir(path.join(dir, "Inbox"))).toEqual(["random.jpg"]);
      expect(lines).toEqual(["  Inbox/OS_unit2.pdf → Operating_Systems/02_Notes/Unit_2/OS_unit2 (2).pdf"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("leaves a file Autopilot hasn't read yet for a later tick", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "inbox-"));
    try {
      await mkdir(path.join(dir, "Inbox"), { recursive: true });
      await writeFile(path.join(dir, "Inbox", "OS_unit2.pdf"), "shared");
      const table = (data: unknown[]) => ({ select: () => ({ eq: async () => ({ data, error: null }) }) });
      const supabase = { from: (t: string) => table(t === "subjects" ? SUBJECTS : []) };
      expect(await fileInbox({ supabase, pin: "1234", dir, log: () => {}, readOf: async () => "wait" })).toBe(0);
      expect(await readdir(path.join(dir, "Inbox"))).toEqual(["OS_unit2.pdf"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does nothing, and asks nothing, with an empty Inbox", async () => {
    const supabase = { from: () => { throw new Error("no queries expected"); } };
    expect(await fileInbox({ supabase, pin: "1234", dir: tmpdir() + "/no-such-folder" })).toBe(0);
  });
});

