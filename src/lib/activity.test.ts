/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => ({ insert: (row: unknown) => insert(table, row) }) },
}));

import { installStep, recordActiveDay } from "@/lib/activity";

const WED = new Date(2026, 9, 7, 9, 0);
const THU = new Date(2026, 9, 8, 9, 0);

beforeEach(() => {
  insert.mockReset().mockResolvedValue({ error: null });
  localStorage.clear();
});

describe("recordActiveDay", () => {
  it("writes the PIN and the day, and nothing that identifies the person", async () => {
    await recordActiveDay("1234", WED);
    expect(insert).toHaveBeenCalledWith("active_days", {
      device_id: "1234",
      day: "2026-10-07",
      installed: false,
      release: "test",
    });
  });

  it("writes once a day, however often the app is opened", async () => {
    await recordActiveDay("1234", WED);
    await recordActiveDay("1234", WED);
    expect(insert).toHaveBeenCalledTimes(1);
    await recordActiveDay("1234", THU);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  /** Signing in to another account on the same phone is another user. */
  it("counts another account on the same device separately", async () => {
    await recordActiveDay("1234", WED);
    await recordActiveDay("5678", WED);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("tries again next launch when the write is refused", async () => {
    insert.mockResolvedValueOnce({ error: { message: "offline" } });
    await recordActiveDay("1234", WED);
    await recordActiveDay("1234", WED);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  /** Already recorded today, e.g. from another tab: that's success, not a retry. */
  it("takes a duplicate as already recorded", async () => {
    insert.mockResolvedValueOnce({ error: { code: "23505", message: "duplicate key" } });
    await recordActiveDay("1234", WED);
    await recordActiveDay("1234", WED);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("never throws, even when the network does", async () => {
    insert.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(recordActiveDay("1234", WED)).resolves.toBeUndefined();
  });
});

describe("installStep", () => {
  const UA = {
    iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    android: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  };

  it("sends an iPhone, and an iPad that says it's a Mac, to Safari's Share", () => {
    expect(installStep({ userAgent: UA.iphone, maxTouchPoints: 5 }, "phone").detail).toBe("In Safari, tap Share, then Add to Home Screen.");
    expect(installStep({ userAgent: UA.mac, maxTouchPoints: 5 }, "phone").detail).toBe("In Safari, tap Share, then Add to Home Screen.");
  });

  it("puts it in a Mac's Dock from Safari, and installs it from any other computer's browser", () => {
    expect(installStep({ userAgent: UA.mac, maxTouchPoints: 0 }, "computer")).toEqual({ title: "Put AcadKit in your Dock", detail: "In Safari, choose File, then Add to Dock." });
    expect(installStep({ userAgent: UA.macChrome, maxTouchPoints: 0 }, "computer").title).toBe("Install AcadKit as an app");
  });

  it("asks other phones to tap their browser's menu", () => {
    expect(installStep({ userAgent: UA.android, maxTouchPoints: 5 }, "phone").detail).toBe("In your browser's menu, tap Install app or Add to Home screen.");
  });
});
