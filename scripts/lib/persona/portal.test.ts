import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { alertOnLogout, portalStatus, uploadAttendance } from "./portal.mjs";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "persona-portal-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const attendance = [
  { code: "21CSC201J", conducted: 86, attended: 57, absent: 29, percentage: 66.28 },
  { code: "21CSC202J", conducted: 90, attended: 80, absent: 10, percentage: 88.89 },
];

function fakeSupabase(historyError: string | null = null) {
  const calls: Array<{ table: string; op: string; rows: Array<Record<string, unknown>> }> = [];
  return {
    calls,
    from: (table: string) => ({
      upsert: async (rows: Array<Record<string, unknown>>) => (calls.push({ table, op: "upsert", rows }), { error: null }),
      insert: async (rows: Array<Record<string, unknown>>) => (calls.push({ table, op: "insert", rows }), { error: historyError ? { message: historyError } : null }),
    }),
  };
}

const write = (state: unknown) => writeFile(path.join(dir, "state.json"), JSON.stringify(state));

describe("saving attendance", () => {
  it("refreshes the snapshots every read and adds history only when a number changes", async () => {
    const supabase = fakeSupabase();
    await write({ portal: { read_at: "2026-11-28T05:30:00Z", attendance } });
    expect(await uploadAttendance({ supabase, pin: "1234", dir })).toBe("2 subjects to AcadKit, numbers changed");
    expect(supabase.calls.map((c) => `${c.table}.${c.op}`)).toEqual(["portal_snapshots.upsert", "portal_snapshot_history.insert"]);
    expect(supabase.calls[0].rows[0]).toEqual({ device_id: "1234", subject_code: "21CSC201J", conducted: 86, absent: 29, percentage: 66.28, as_of: "2026-11-28", synced_at: "2026-11-28T05:30:00Z" });
    expect(supabase.calls[1].rows[0].source).toBe("mac");

    expect(await uploadAttendance({ supabase, pin: "1234", dir })).toBe("2 subjects as of 11:00");
    await write({ portal: { read_at: "2026-11-28T05:45:00Z", attendance } });
    expect(await uploadAttendance({ supabase, pin: "1234", dir })).toBe("2 subjects to AcadKit");
    expect(supabase.calls.map((c) => c.op)).toEqual(["upsert", "insert", "upsert"]);
    expect(JSON.parse(await readFile(path.join(dir, "uploaded.json"), "utf8")).read_at).toBe("2026-11-28T05:45:00Z");
  });

  it("waits for a login, and names the migration a history row needs", async () => {
    await write({ portal: { login: true } });
    expect(await uploadAttendance({ supabase: fakeSupabase(), pin: "1234", dir })).toBe("waiting for you to log in to the Student Portal");
    await write({ portal: { read_at: "2026-11-28T05:30:00Z", attendance } });
    await expect(uploadAttendance({ supabase: fakeSupabase("violates check constraint portal_snapshot_history_source_check"), pin: "1234", dir })).rejects.toThrow("migration 066");
  });
});

describe("the logout alert", () => {
  function storage() {
    const uploads = new Map<string, string>();
    return { uploads, storage: { from: () => ({ upload: async (key: string, body: string) => (uploads.set(key, body), { error: null }) }) } };
  }

  it("queues one phone push per logout and never while logged in", async () => {
    await write({ portal: { login: false, logout_at: null } });
    expect(await alertOnLogout({ supabase: storage(), pin: "1234", dir })).toBeNull();

    await write({ portal: { login: true, logout_at: "2026-11-28T10:20:00Z" } });
    const s = storage();
    expect(await alertOnLogout({ supabase: s, pin: "1234", dir })).toBe("logout alert queued for 15:50");
    const alert = JSON.parse(s.uploads.get("1234/persona/alert.json")!);
    expect(alert).toMatchObject({ ref: "portal-out|2026-11-28T10:20", title: "Student Portal", url: "/attendance" });
    expect(alert.body).toContain("Logged out at 15:50");

    expect(await alertOnLogout({ supabase: storage(), pin: "1234", dir })).toBeNull(); // same logout, no repeat
    await write({ portal: { login: true, logout_at: "2026-11-28T16:00:00Z" } });
    expect(await alertOnLogout({ supabase: storage(), pin: "1234", dir })).toBe("logout alert queued for 21:30");
  });
});

describe("the read's status", () => {
  it("passes its note on and fails with its error", async () => {
    expect(await portalStatus(dir)).toBe("the portals haven't been read yet");
    await writeFile(path.join(dir, "status.json"), JSON.stringify({ ok: true, note: "portal: 7 subjects" }));
    expect(await portalStatus(dir)).toBe("portal: 7 subjects");
    await writeFile(path.join(dir, "status.json"), JSON.stringify({ ok: false, note: "Chrome blocks it: View > Developer > Allow JavaScript from Apple Events" }));
    await expect(portalStatus(dir)).rejects.toThrow("Allow JavaScript from Apple Events");
  });
});
