import { describe, expect, it } from "vitest";
import { handle, istDate, shareFolder, type Account, type Shared } from "./handle.ts";

const TOKEN = "a".repeat(48);
const account: Account = {
  settings: { id: "s", device_id: "1234", semester: 3, target_sgpa: 8, min_attendance: 75, sem_start: "2026-07-21", sem_end: "2026-11-18", declared_holidays: [], current_day_order: 1 },
  subjects: [{ id: "os", device_id: "1234", code: "21CSC202J", name: "Operating Systems", credits: 4, type: "theory", faculty: null, color_hex: "#000" }],
  slots: [{ id: "x", device_id: "1234", subject_id: "os", day_order: 3, start_time: "08:00:00", end_time: "08:50:00", room: "TP301" }],
  attendance: [],
  snapshots: [],
  deadlines: [],
};

/** The handler with one account behind TOKEN and the clock at `now`. */
function feeds(now: string) {
  const asked: string[] = [];
  const shared: Shared[] = [];
  const deps = {
    use: async (t: string) => (asked.push(t), t === TOKEN ? { pin: "1234", allowed: true } : null),
    load: async () => account,
    share: async (_pin: string, f: Shared) => void shared.push(f),
    now: () => new Date(now),
    uuid: () => "u1",
  };
  return { asked, shared, get: (path: string, init?: RequestInit) => handle(new Request(`https://x.supabase.co/functions/v1/feeds${path}`, init), deps) };
}

describe("feeds", () => {
  it("answers today with the account's day, on IST's date", async () => {
    // 00:30 IST on Wednesday 7 Oct, still the 6th in UTC.
    const res = await feeds("2026-10-06T19:00:00Z").get(`/today?token=${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ date: "2026-10-07", dayOrder: 3, first: "08:00", alarm: "07:00" });
    expect(body.classes).toHaveLength(1);
  });

  it("takes the token from an Authorization header too", async () => {
    const res = await feeds("2026-10-07T03:00:00Z").get("/today", { headers: { Authorization: `Bearer ${TOKEN}` } });
    expect(res.status).toBe(200);
  });

  it("refuses a missing, malformed or unknown token alike, without looking up a malformed one", async () => {
    const f = feeds("2026-10-07T03:00:00Z");
    for (const q of ["", "?token=short", `?token=${"b".repeat(48)}`]) {
      const res = await f.get(`/today${q}`);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unknown token" });
    }
    expect(f.asked).toEqual(["b".repeat(48)]);
  });

  it("serves a calendar to subscribe to: a week back to two months ahead, with the tests", async () => {
    const withTest = { ...account, deadlines: [{ id: "ft2", device_id: "1234", subject_id: "os", title: "OS FT-II", type: "exam" as const, due_date: "2026-10-29T09:00:00+05:30", status: "pending" as const, priority: "high" as const }] };
    const res = await handle(new Request(`https://x/functions/v1/feeds/calendar.ics?token=${TOKEN}`), {
      use: async () => ({ pin: "1234", allowed: true }),
      load: async () => withTest,
      share: async () => {},
      now: () => new Date("2026-10-07T03:00:00Z"),
    });
    expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    const ics = await res.text();
    expect(ics).toContain("X-WR-CALNAME:AcadKit");
    expect(ics).toContain("SUMMARY:OS FT-II");
    // Day Order 3 days only: OS meets once on each.
    const classes = [...ics.matchAll(/DTSTART;TZID=Asia\/Kolkata:(\d{8})/g)].map((m) => m[1]);
    expect(classes[0] >= "20260930").toBe(true);
    expect(classes.at(-1)! <= "20261206").toBe(true);
    expect(classes).toContain("20261007");
  });

  it("answers 429 once a token is over its limit, and says when to try again", async () => {
    const res = await handle(new Request(`https://x/functions/v1/feeds/today?token=${TOKEN}`), {
      use: async () => ({ pin: "1234", allowed: false }),
      load: async () => account,
      share: async () => {},
      now: () => new Date(),
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("knows only its feeds, each with its one method", async () => {
    const f = feeds("2026-10-07T03:00:00Z");
    expect((await f.get(`/marks?token=${TOKEN}`)).status).toBe(404);
    expect((await f.get(`/today?token=${TOKEN}`, { method: "POST" })).status).toBe(405);
    expect((await f.get(`/share?token=${TOKEN}&name=a.pdf`)).status).toBe(405);
  });

  it("takes a shared file into the inbox, for the Mac to save into Inbox/", async () => {
    const f = feeds("2026-10-07T03:00:00Z");
    const res = await f.get(`/share?token=${TOKEN}&name=${encodeURIComponent("Board photo.jpg")}`, {
      method: "POST",
      body: new Uint8Array([1, 2, 3]),
      headers: { "Content-Type": "image/jpeg" },
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ path: "Inbox/Board photo.jpg" });
    expect(f.shared).toEqual([{ key: "1234/inbox/u1/Board photo.jpg", path: "Inbox/Board photo.jpg", type: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) }]);
  });

  it("names a photo the share sheet sent without an extension by its type", async () => {
    const f = feeds("2026-10-07T03:00:00Z");
    await f.get(`/share?token=${TOKEN}&name=IMG_4021`, { method: "POST", body: "x", headers: { "Content-Type": "image/heic" } });
    expect(f.shared[0].path).toBe("Inbox/IMG_4021.heic");
  });

  it("keeps a shared file's name and folder inside the study folder", async () => {
    const f = feeds("2026-10-07T03:00:00Z");
    await f.get(`/share?token=${TOKEN}&name=${encodeURIComponent("../../.env")}&folder=${encodeURIComponent("OS/../_src")}`, { method: "POST", body: "x" });
    // ".." parts go, and no part may start with "." or "_" (the sync would skip it).
    expect(f.shared[0].path).toBe("OS/upload-src/upload--..-.env");
    expect(shareFolder(null)).toBe("Inbox");
    expect(shareFolder("/Operating_Systems//Unit_3/")).toBe("Operating_Systems/Unit_3");
  });

  it("refuses a shared file with no name, no bytes, or over 50 MB, and an unknown token", async () => {
    const f = feeds("2026-10-07T03:00:00Z");
    expect((await f.get(`/share?token=${TOKEN}`, { method: "POST", body: "x" })).status).toBe(400);
    expect((await f.get(`/share?token=${TOKEN}&name=a.pdf`, { method: "POST" })).status).toBe(400);
    expect((await f.get(`/share?token=${TOKEN}&name=a.pdf`, { method: "POST", body: "x", headers: { "Content-Length": String(51 * 1024 * 1024) } })).status).toBe(413);
    expect((await f.get(`/share?token=${"b".repeat(48)}&name=a.pdf`, { method: "POST", body: "x" })).status).toBe(401);
    expect(f.shared).toEqual([]);
  });
});

describe("istDate", () => {
  it("turns over at midnight IST, not UTC", () => {
    expect(istDate(new Date("2026-10-06T18:29:00Z"))).toBe("2026-10-06");
    expect(istDate(new Date("2026-10-06T18:30:00Z"))).toBe("2026-10-07");
  });
});
