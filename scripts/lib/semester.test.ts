import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkRunup } from "./runup.mjs";
import {
  applySemesterSwitch,
  autoSyncReadsEnv,
  carryRunup,
  clearOldCaches,
  isSemesterFolder,
  manifestShas,
  requestedSemester,
  semesterDir,
  staleCacheFiles,
  studyDirOf,
  switchSemester,
  withStudyDir,
  withoutNextDir,
} from "./semester.mjs";

type Row = Record<string, unknown>;

/** Supabase in memory: the storage and table calls semester.mjs makes. */
function fakeSupabase(objects: Record<string, unknown> = {}, tables: Record<string, Row[]> = {}) {
  const store = new Map<string, string>(Object.entries(objects).map(([k, v]) => [k, JSON.stringify(v)]));
  const db = new Map<string, Row[]>(Object.entries(tables).map(([t, rows]) => [t, rows.map((r) => ({ ...r }))]));
  const storage = {
    from: () => ({
      download: async (key: string) => (store.has(key) ? { data: new Blob([store.get(key)!]), error: null } : { data: null, error: { message: "not found" } }),
      upload: async (key: string, body: string) => {
        store.set(key, body);
        return { error: null };
      },
      list: async (prefix: string) => {
        const names = new Map<string, boolean>();
        for (const k of store.keys()) {
          if (!k.startsWith(`${prefix}/`)) continue;
          const rest = k.slice(prefix.length + 1);
          names.set(rest.split("/")[0], !rest.includes("/"));
        }
        return { data: [...names].map(([name, file]) => ({ name, id: file ? name : null })), error: null };
      },
      remove: async (keys: string[]) => {
        for (const k of keys) store.delete(k);
        return { error: null };
      },
    }),
  };
  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: "select" | "delete" = "select";
    let col = "*";
    let range: [number, number] | null = null;
    const q = {
      select(c: string) {
        col = c;
        return q;
      },
      delete() {
        mode = "delete";
        return q;
      },
      eq(c: string, v: unknown) {
        filters.push((r) => r[c] === v);
        return q;
      },
      in(c: string, vs: unknown[]) {
        filters.push((r) => vs.includes(r[c]));
        return q;
      },
      range(a: number, b: number) {
        range = [a, b];
        return q;
      },
      then(resolve: (v: unknown) => void) {
        if (!db.has(table)) return resolve({ data: null, error: { message: `relation "${table}" does not exist` }, count: null });
        const rows = db.get(table)!;
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (mode === "delete") {
          db.set(table, rows.filter((r) => !hit.includes(r)));
          return resolve({ data: null, error: null, count: hit.length });
        }
        const page = range ? hit.slice(range[0], range[1] + 1) : hit;
        resolve({ data: page.map((r) => (col === "*" ? r : { [col]: r[col] })), error: null });
      },
    };
    return q;
  }
  return { supabase: { storage, from }, store, db, json: (k: string) => JSON.parse(store.get(k)!) };
}

const SHA = (c: string) => c.repeat(64);
const SEM4 = { version: 1, root: "SRM_Sem4", files: [{ path: "x.pdf", key: `0404/blobs/${SHA("a")}.pdf` }] };
const AUTO_SYNC = '#!/bin/bash\nexport PATH=/usr/bin:/bin\nDIR="$HOME/Documents/SRM_Sem3"\nREPO="$HOME/Acadkit"\necho "$DIR"\n';

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "semester-test-"));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("helpers", () => {
  it("names a semester's folder", () => {
    expect(semesterDir(4, "/Users/k/Documents")).toBe("/Users/k/Documents/SRM_Sem4");
  });

  it("sets STUDY_DIR in .env.local and leaves the rest alone", () => {
    const env = "A=1\nSTUDY_DIR=~/Documents/SRM_Sem3\nB=2\n";
    expect(withStudyDir(env, "/home/k/Documents/SRM_Sem4", "/home/k")).toBe("A=1\nSTUDY_DIR=~/Documents/SRM_Sem4\nB=2\n");
    expect(withStudyDir("A=1", "/data/x", "/home/k")).toBe("A=1\nSTUDY_DIR=/data/x\n");
    expect(withoutNextDir("A=1\nSTUDY_NEXT_DIR=~/Documents/SRM_Sem4\nB=2\n", "/home/k/Documents/SRM_Sem4", "/home/k")).toBe("A=1\nB=2\n");
    expect(withoutNextDir("STUDY_NEXT_DIR=~/Documents/SRM_Sem5\n", "/home/k/Documents/SRM_Sem4", "/home/k")).toBe("STUDY_NEXT_DIR=~/Documents/SRM_Sem5\n");
    expect(studyDirOf("STUDY_DIR=~/Documents/SRM_Sem4\n", "/home/k")).toBe("/home/k/Documents/SRM_Sem4");
    expect(studyDirOf("A=1\n")).toBeNull();
  });

  it("makes the auto-sync read its folder from .env.local, once", () => {
    const patched = autoSyncReadsEnv(AUTO_SYNC)!;
    expect(patched).toContain("sed -n 's/^STUDY_DIR=//p'");
    expect(autoSyncReadsEnv(patched)).toBeNull();
    expect(autoSyncReadsEnv("#!/bin/bash\necho hi\n")).toBeNull();
  });

  it("the patched line really reads STUDY_DIR, ~ and all", async () => {
    await mkdir(path.join(tmp, "Acadkit"), { recursive: true });
    await writeFile(path.join(tmp, "Acadkit", ".env.local"), "X=1\nSTUDY_DIR=~/Documents/SRM_Sem4\n");
    const script = path.join(tmp, "auto-sync.sh");
    await writeFile(script, autoSyncReadsEnv(AUTO_SYNC)!);
    expect(execFileSync("/bin/bash", [script], { env: { HOME: tmp, PATH: "/usr/bin:/bin" } }).toString().trim()).toBe(`${tmp}/Documents/SRM_Sem4`);
  });

  it("only ever calls an SRM_Sem<n> in Documents a semester folder", () => {
    expect(isSemesterFolder("/Users/k/Documents/SRM_Sem3", "/Users/k")).toBe(true);
    expect(isSemesterFolder("/Users/k/Documents/SRM_Sem3/", "/Users/k")).toBe(true);
    for (const p of ["/Users/k", "/Users/k/Documents", "/Users/k/Documents/Notes", "/Users/k/Documents/a/SRM_Sem3", "/", "/Users/k/Desktop/SRM_Sem3"])
      expect(isSemesterFolder(p, "/Users/k")).toBe(false);
  });

  it("finds which cached files belong to the new folder", () => {
    const keep = manifestShas(SEM4);
    expect([...keep]).toEqual([SHA("a")]);
    expect(staleCacheFiles([`${SHA("a")}.json`, `${SHA("b")}.json`, `${SHA("b")}.deck3.pdf`, "notes.txt"], keep)).toEqual([`${SHA("b")}.json`, `${SHA("b")}.deck3.pdf`]);
  });

  it("reads which semester a request asks for", () => {
    expect(requestedSemester({ to: 4 })).toBe(4);
    expect(requestedSemester({ to: "5" })).toBe(5);
    expect(requestedSemester({ to: 0 })).toBeNull();
  });

  it("carries the Run-up into the new folder: its links re-rooted, the old folder's dropped, ids kept", () => {
    const plan = {
      version: 1,
      events: [
        {
          id: "os-endsem",
          files: ["Operating_Systems/notes.pdf", { path: "SRM_Sem4/DBMS/intro.pdf", why: "first look" }],
          pyqs: [{ file: "Operating_Systems/2025.pdf", page: 2, text: "Q" }, { file: "SRM_Sem4/DBMS/2024.pdf", page: 3, text: "Q" }, { text: "no file" }],
        },
      ],
      days: [{ date: "2026-12-02", tasks: [{ id: "2026-12-02#1", text: "ER diagrams", files: ["SRM_Sem4/DBMS/er.pdf", "Operating_Systems/notes.pdf"] }] }],
    };
    const { plan: out, kept, dropped } = carryRunup(plan, "SRM_Sem4");
    expect([kept, dropped]).toEqual([3, 3]);
    expect(out.events[0].files).toEqual([{ path: "DBMS/intro.pdf", why: "first look" }]);
    expect(out.events[0].pyqs).toEqual([{ file: null, page: null, text: "Q" }, { file: "DBMS/2024.pdf", page: 3, text: "Q" }, { text: "no file" }]);
    expect(out.days[0].tasks[0]).toEqual({ id: "2026-12-02#1", text: "ER diagrams", files: ["DBMS/er.pdf"] });
    expect(plan.days[0].tasks[0].files).toHaveLength(2);
  });

  it("clears the old folder's caches and keeps the new one's", async () => {
    await mkdir(path.join(tmp, "text"));
    await mkdir(path.join(tmp, "renditions"));
    await writeFile(path.join(tmp, "text", `${SHA("a")}.json`), "{}");
    await writeFile(path.join(tmp, "text", `${SHA("b")}.json`), "{}");
    await writeFile(path.join(tmp, "renditions", `${SHA("b")}.deck3.pdf`), "%PDF");
    await writeFile(path.join(tmp, "question-vectors.json"), "{}");
    expect(await clearOldCaches(SEM4, tmp)).toBe(2);
    expect(await readdir(path.join(tmp, "text"))).toEqual([`${SHA("a")}.json`]);
    expect(await readdir(path.join(tmp, "renditions"))).toEqual([]);
    await expect(stat(path.join(tmp, "question-vectors.json"))).rejects.toThrow();
  });
});

describe("switchSemester", () => {
  async function setup() {
    const from = path.join(tmp, "SRM_Sem3");
    const to = path.join(tmp, "SRM_Sem4");
    await mkdir(path.join(from, "_src"), { recursive: true });
    await mkdir(to);
    await writeFile(path.join(from, "_src", "acadkit_curriculum.json"), "{}");
    await writeFile(path.join(from, "_src", "md2pdf.py"), "# tool");
    await writeFile(path.join(from, "_src", "acadkit_prep.json"), '{"tests":[{"label":"old"}]}');
    const envFile = path.join(tmp, ".env.local");
    await writeFile(envFile, "STUDY_PIN=0404\nSTUDY_DIR=~/Documents/SRM_Sem3\n");
    const autoSyncFile = path.join(tmp, "auto-sync.sh");
    await writeFile(autoSyncFile, AUTO_SYNC, { mode: 0o755 });
    const stateDir = path.join(tmp, "state");
    const cacheDir = path.join(tmp, "cache");
    await mkdir(stateDir);
    await mkdir(path.join(cacheDir, "text"), { recursive: true });
    await writeFile(path.join(cacheDir, "text", `${SHA("b")}.json`), "{}");
    return { from, to, envFile, autoSyncFile, stateDir, cacheDir };
  }

  /** The old folder's data, and the new folder's, in storage and tables. */
  function world() {
    return fakeSupabase(
      {
        "0404/manifest.json": { root: "SRM_Sem3", files: [{ key: `0404/blobs/${SHA("b")}.pdf` }] },
        "0404/inbox/u1/stray.pdf": "x",
        "0404/units.json": { courses: { "21CSE251T": {} } },
      },
      {
        study_chunks: [
          { device_id: "0404", file_key: `0404/blobs/${SHA("b")}.pdf` },
          { device_id: "0404", file_key: `0404/blobs/${SHA("a")}.pdf` },
          { device_id: "9999", file_key: "other" },
        ],
        study_file_deletions: [{ device_id: "0404" }],
        study_uploads: [{ device_id: "0404" }],
        suggestions: [{ device_id: "0404" }, { device_id: "9999" }],
        syllabus_progress: [{ device_id: "0404", course_code: "21CSC202J" }, { device_id: "0404", course_code: "21CSE251T" }],
        portal_snapshot_history: [{ device_id: "0404" }],
        forecast_log: [{ device_id: "0404" }],
        lectures: [{ device_id: "0404" }, { device_id: "9999" }],
      }
    );
  }

  it("seeds the new folder, repoints the Mac, syncs, then clears the old folder everywhere", async () => {
    const p = await setup();
    const fake = world();
    const synced: string[] = [];
    const trashed: string[] = [];
    const runSync = async (dir: string) => {
      synced.push(dir);
      fake.store.set("0404/manifest.json", JSON.stringify(SEM4));
      return "Synced.";
    };
    await switchSemester({
      supabase: fake.supabase,
      pin: "0404",
      ...p,
      runSync,
      trash: async (d: string) => void trashed.push(d),
      isTrashable: () => true,
      log: () => {},
    });

    // The new folder.
    expect(await readFile(path.join(p.to, "_src", "acadkit_curriculum.json"), "utf8")).toBe("{}");
    expect(await readFile(path.join(p.to, "_src", "md2pdf.py"), "utf8")).toBe("# tool");
    expect(JSON.parse(await readFile(path.join(p.to, "_src", "acadkit_prep.json"), "utf8"))).toEqual({ tests: [] });
    expect(JSON.parse(await readFile(path.join(p.to, "_src", "acadkit_suggestions.json"), "utf8"))).toEqual({ deadlines: [] });
    expect(studyDirOf(await readFile(p.envFile, "utf8"))).toBe(p.to);
    expect(await readFile(p.autoSyncFile, "utf8")).toContain("STUDY_DIR");
    expect((await stat(p.autoSyncFile)).mode & 0o111).not.toBe(0);
    expect(synced).toEqual([p.to]);

    // The old folder's data, gone; the new one's and other accounts', kept.
    expect(fake.db.get("study_chunks")).toEqual([
      { device_id: "0404", file_key: `0404/blobs/${SHA("a")}.pdf` },
      { device_id: "9999", file_key: "other" },
    ]);
    expect(fake.db.get("study_file_deletions")).toEqual([]);
    expect(fake.db.get("study_uploads")).toEqual([]);
    expect(fake.db.get("suggestions")).toEqual([{ device_id: "9999" }]);
    expect(fake.db.get("syllabus_progress")).toEqual([{ device_id: "0404", course_code: "21CSE251T" }]);
    expect(fake.db.get("portal_snapshot_history")).toEqual([]);
    expect(fake.db.get("forecast_log")).toEqual([]);
    expect(fake.db.get("lectures")).toEqual([{ device_id: "9999" }]);
    expect(fake.store.has("0404/inbox/u1/stray.pdf")).toBe(false);
    expect(await readdir(path.join(p.cacheDir, "text"))).toEqual([]);
    expect(trashed).toEqual([p.from]);
    expect(fake.json("0404/semester-switch.json")).toMatchObject({ state: "done", from: "SRM_Sem3", to: "SRM_Sem4" });
    expect(fake.json("0404/semester-switch.json").message).toMatch(/Trash/);
    await expect(stat(path.join(p.stateDir, "sync.lock"))).rejects.toThrow();
  });

  it("never trashes a folder that isn't a semester folder", async () => {
    const p = await setup();
    const fake = world();
    const trashed: string[] = [];
    const runSync = async () => (fake.store.set("0404/manifest.json", JSON.stringify(SEM4)), "ok");
    // The real check: the temp folder isn't ~/Documents/SRM_Sem<n>.
    await switchSemester({ supabase: fake.supabase, pin: "0404", ...p, runSync, trash: async (d: string) => void trashed.push(d), log: () => {} });
    expect(trashed).toEqual([]);
    expect(fake.json("0404/semester-switch.json").message).toMatch(/stays on your Mac/);
  });

  it("with removeOld off, leaves the old folder and its data alone", async () => {
    const p = await setup();
    const fake = world();
    const trashed: string[] = [];
    const runSync = async () => (fake.store.set("0404/manifest.json", JSON.stringify(SEM4)), "ok");
    await switchSemester({ supabase: fake.supabase, pin: "0404", ...p, runSync, removeOld: false, trash: async (d: string) => void trashed.push(d), isTrashable: () => true, log: () => {} });
    expect(trashed).toEqual([]);
    expect(fake.db.get("suggestions")).toHaveLength(2);
    expect(studyDirOf(await readFile(p.envFile, "utf8"))).toBe(p.to);
  });

  it("changes nothing on a dry run", async () => {
    const p = await setup();
    const fake = world();
    const lines: string[] = [];
    await switchSemester({ supabase: fake.supabase, pin: "0404", ...p, runSync: async () => "", dryRun: true, isTrashable: () => true, log: (l: string) => lines.push(l) });
    expect(lines.join("\n")).toMatch(/goes to the Trash/);
    expect(await readFile(p.envFile, "utf8")).toContain("SRM_Sem3");
    expect(await readFile(p.autoSyncFile, "utf8")).toBe(AUTO_SYNC);
    expect(fake.db.get("suggestions")).toHaveLength(2);
    await expect(stat(path.join(p.to, "_src"))).rejects.toThrow();
  });

  describe("the Run-up", () => {
    // Sem 3's last weeks, then the head start on Sem 4's files, filed ahead as "SRM_Sem4/…".
    const PLAN = {
      version: 1,
      title: "Run-up",
      start: "2026-11-29",
      end: "2026-12-03",
      events: [
        { id: "os-endsem", title: "OS end-sem", date: "2026-11-30", files: ["Operating_Systems/notes.pdf"], pyqs: [{ file: "Operating_Systems/2025.pdf", page: 2, text: "Deadlock avoidance" }] },
        { id: "sem4-start", title: "Sem 4 begins", date: "2027-01-06", files: [{ path: "SRM_Sem4/x.pdf", why: "the prep map" }] },
      ],
      days: [
        { date: "2026-11-29", tasks: [{ id: "2026-11-29#1", text: "Banker's algorithm", event: "os-endsem", files: ["Operating_Systems/notes.pdf"] }] },
        { date: "2026-12-02", tasks: [{ id: "2026-12-02#1", text: "DBMS Unit 1", event: "sem4-start", files: ["SRM_Sem4/x.pdf"] }] },
      ],
    };

    async function withPlan() {
      const p = await setup();
      await writeFile(path.join(p.from, "_src", "acadkit_runup.json"), JSON.stringify(PLAN));
      await writeFile(path.join(p.from, "_src", "build_runup.py"), "# writes the plan");
      return p;
    }

    it("a dry run says what it carries and writes nothing", async () => {
      const p = await withPlan();
      const lines: string[] = [];
      await switchSemester({ supabase: world().supabase, pin: "0404", ...p, runSync: async () => "", dryRun: true, log: (l: string) => lines.push(l) });
      expect(lines).toContain("  _src/acadkit_runup.json: carried from SRM_Sem3, 2 links kept, 3 to SRM_Sem3's files dropped");
      expect(lines).toContain("  _src/build_runup.py: copied from SRM_Sem3");
      await expect(stat(path.join(p.to, "_src"))).rejects.toThrow();
    });

    it("survives the switch: every task and tick id, and every link into the new folder", async () => {
      const p = await withPlan();
      const fake = world();
      const runSync = async () => (fake.store.set("0404/manifest.json", JSON.stringify(SEM4)), "ok");
      await switchSemester({ supabase: fake.supabase, pin: "0404", ...p, runSync, log: () => {} });

      const carried = JSON.parse(await readFile(path.join(p.to, "_src", "acadkit_runup.json"), "utf8"));
      // What the next sync of the new folder sends to the Run-up page.
      const { body, warnings } = checkRunup(carried, new Set(SEM4.files.map((f) => f.path)), "SRM_Sem4");
      expect(warnings).toEqual([]);
      expect(body!.days.flatMap((d) => d.tasks.map((t) => t.id))).toEqual(["2026-11-29#1", "2026-12-02#1"]);
      expect(body!.days[1].tasks[0].files).toEqual(["x.pdf"]);
      expect(body!.events.find((e) => e.id === "sem4-start")!.files).toEqual([{ path: "x.pdf", why: "the prep map" }]);
      expect(body!.events.find((e) => e.id === "os-endsem")!.pyqs).toEqual([expect.objectContaining({ file: null, text: "Deadlock avoidance" })]);
      expect(await readFile(path.join(p.to, "_src", "build_runup.py"), "utf8")).toBe("# writes the plan");

      // The generators' own "SRM_Sem4/…" links still resolve, re-run in the new folder.
      expect(checkRunup(PLAN, new Set(SEM4.files.map((f) => f.path)), "SRM_Sem4").body!.days[1].tasks[0].files).toEqual(["x.pdf"]);
    });

    it("leaves a plan the new folder already has", async () => {
      const p = await withPlan();
      await mkdir(path.join(p.to, "_src"));
      await writeFile(path.join(p.to, "_src", "acadkit_runup.json"), '{"version":1}');
      const fake = world();
      const runSync = async () => (fake.store.set("0404/manifest.json", JSON.stringify(SEM4)), "ok");
      await switchSemester({ supabase: fake.supabase, pin: "0404", ...p, runSync, log: () => {} });
      expect(await readFile(path.join(p.to, "_src", "acadkit_runup.json"), "utf8")).toBe('{"version":1}');
    });
  });

  it("won't start without the new folder, or while a sync runs", async () => {
    const p = await setup();
    const fake = world();
    await expect(switchSemester({ supabase: fake.supabase, pin: "0404", ...p, to: path.join(tmp, "SRM_Sem9"), runSync: async () => "" })).rejects.toThrow(/no folder/);
    await mkdir(path.join(p.stateDir, "sync.lock"));
    await expect(switchSemester({ supabase: fake.supabase, pin: "0404", ...p, runSync: async () => "" })).rejects.toThrow(/sync is running/);
    expect(await readFile(p.envFile, "utf8")).toContain("SRM_Sem3");
  });

  it("deletes nothing when the sync doesn't take, and says so in the app", async () => {
    const p = await setup();
    const fake = world();
    const trashed: string[] = [];
    await expect(
      switchSemester({ supabase: fake.supabase, pin: "0404", ...p, runSync: async () => "boom", trash: async (d: string) => void trashed.push(d), isTrashable: () => true, log: () => {} })
    ).rejects.toThrow(/still shows SRM_Sem3/);
    expect(trashed).toEqual([]);
    expect(fake.db.get("suggestions")).toHaveLength(2);
    expect(fake.json("0404/semester-switch.json")).toMatchObject({ state: "failed" });
  });
});

describe("applySemesterSwitch", () => {
  it("takes the newest request, clears them all, and says when it's already there", async () => {
    const fake = fakeSupabase({
      "0404/inbox/semester-switch-1.json": { to: 3 },
      "0404/inbox/semester-switch-2.json": { to: 3 },
      "0404/inbox/abc/upload.pdf": "x",
    });
    const dir = path.join(tmp, "SRM_Sem3");
    const out = await applySemesterSwitch({ supabase: fake.supabase, pin: "0404", dir, documents: tmp, repo: tmp, envFile: "", log: () => {} });
    expect(out).toBeNull();
    expect([...fake.store.keys()].filter((k) => k.includes("semester-switch-"))).toEqual([]);
    expect(fake.store.has("0404/inbox/abc/upload.pdf")).toBe(true);
    expect(fake.json("0404/semester-switch.json")).toMatchObject({ state: "done", to: "SRM_Sem3" });
  });

  it("does nothing without a request", async () => {
    const fake = fakeSupabase();
    expect(await applySemesterSwitch({ supabase: fake.supabase, pin: "0404", dir: tmp, documents: tmp, repo: tmp, envFile: "" })).toBeNull();
    expect(fake.store.size).toBe(0);
  });
});
