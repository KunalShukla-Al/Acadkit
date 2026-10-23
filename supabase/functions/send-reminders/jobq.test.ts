import { describe, expect, it } from "vitest";
import { jobsFor, notYetSent, parseMode, shadowJob, webpushJob, type Reminder } from "./jobq.ts";

const CLASS: Reminder = {
  device_id: "1111",
  kind: "class",
  ref: "slot-1|2026-10-07",
  title: "Operating Systems in 10 min",
  body: "8:00 AM · Day Order 3",
  url: "/",
};
const MARK: Reminder = {
  device_id: "2222",
  kind: "mark",
  ref: "mark|2026-10-07",
  title: "Mark today's attendance",
  body: "2 classes still unmarked from today.",
  url: "/attendance",
};

describe("parseMode", () => {
  it("is off unless it says shadow or on", () => {
    expect(parseMode(undefined)).toBe("off");
    expect(parseMode("")).toBe("off");
    expect(parseMode("off")).toBe("off");
    expect(parseMode("true")).toBe("off");
    expect(parseMode("shadw")).toBe("off");
  });

  it("reads shadow and on, forgiving case and spaces", () => {
    expect(parseMode("shadow")).toBe("shadow");
    expect(parseMode(" Shadow ")).toBe("shadow");
    expect(parseMode("on")).toBe("on");
    expect(parseMode("ON\n")).toBe("on");
  });
});

describe("webpushJob", () => {
  it("is keyed by device, kind and ref, and carries the whole reminder", () => {
    expect(webpushJob(CLASS)).toEqual({
      kind: "webpush",
      idempotency_key: "webpush:1111:class:slot-1|2026-10-07",
      payload: {
        device_id: "1111",
        kind: "class",
        ref: "slot-1|2026-10-07",
        title: "Operating Systems in 10 min",
        body: "8:00 AM · Day Order 3",
        url: "/",
      },
    });
  });

  it("keeps a missing url as null, not dropped", () => {
    const job = webpushJob({ ...CLASS, url: null });
    expect(job.payload).toHaveProperty("url", null);
    expect(JSON.parse(JSON.stringify(job)).payload.url).toBeNull();
  });

  it("leaves run_at to the database (now)", () => {
    expect(webpushJob(CLASS)).not.toHaveProperty("run_at");
  });
});

describe("shadowJob", () => {
  it("is a noop with an empty payload, keyed apart from the real job", () => {
    expect(shadowJob(CLASS)).toEqual({
      kind: "noop",
      idempotency_key: "shadow:1111:class:slot-1|2026-10-07",
      payload: {},
    });
  });
});

describe("jobsFor", () => {
  it("queues nothing when off", () => {
    expect(jobsFor("off", [CLASS, MARK])).toEqual([]);
  });

  it("queues a noop per reminder in shadow", () => {
    expect(jobsFor("shadow", [CLASS, MARK]).map((j) => [j.kind, j.idempotency_key])).toEqual([
      ["noop", "shadow:1111:class:slot-1|2026-10-07"],
      ["noop", "shadow:2222:mark:mark|2026-10-07"],
    ]);
  });

  it("queues a webpush per reminder when on", () => {
    expect(jobsFor("on", [CLASS, MARK]).map((j) => [j.kind, j.idempotency_key])).toEqual([
      ["webpush", "webpush:1111:class:slot-1|2026-10-07"],
      ["webpush", "webpush:2222:mark:mark|2026-10-07"],
    ]);
  });

  it("queues nothing for no reminders", () => {
    expect(jobsFor("on", [])).toEqual([]);
  });
});

describe("notYetSent", () => {
  it("drops reminders already in sent_notifications", () => {
    expect(notYetSent([CLASS, MARK], [{ device_id: "1111", kind: "class", ref: "slot-1|2026-10-07" }])).toEqual([
      MARK,
    ]);
  });

  it("matches on all three of device, kind and ref", () => {
    const sent = [
      { device_id: "2222", kind: "class", ref: "slot-1|2026-10-07" }, // another device
      { device_id: "1111", kind: "mark", ref: "slot-1|2026-10-07" }, // another kind
      { device_id: "1111", kind: "class", ref: "slot-1|2026-10-08" }, // another day
    ];
    expect(notYetSent([CLASS], sent)).toEqual([CLASS]);
  });

  it("keeps everything when nothing has been sent", () => {
    expect(notYetSent([CLASS, MARK], [])).toEqual([CLASS, MARK]);
  });
});
