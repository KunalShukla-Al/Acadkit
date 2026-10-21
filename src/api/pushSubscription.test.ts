import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * savePushSubscription is what tells send-reminders which VAPID
 * pair a subscription needs (migration 041). Without vapid_public a row on
 * the new key reads as the original one and every push to it is refused.
 */

const upsert = vi.fn();
const del = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => ({
      upsert: (row: unknown, opts: unknown) => upsert(table, row, opts),
      delete: () => ({ eq: (col: string, value: unknown) => del(table, col, value) }),
    }),
  },
}));

const { savePushSubscription } = await import("@/api/push");
const { PUSH_ENDPOINT_KEY, VAPID_PUBLIC_KEY } = await import("@/lib/push");

beforeEach(() => {
  localStorage.clear();
  upsert.mockReset().mockResolvedValue({ error: null });
  del.mockReset().mockResolvedValue({ error: null });
});

describe("savePushSubscription", () => {
  it("saves the key the subscription was made with", async () => {
    await savePushSubscription("1234", {
      endpoint: "https://push.test/new",
      p256dh: "p",
      auth: "a",
      vapidPublic: VAPID_PUBLIC_KEY,
    });
    expect(upsert).toHaveBeenCalledWith(
      "push_subscriptions",
      expect.objectContaining({
        device_id: "1234",
        endpoint: "https://push.test/new",
        vapid_public: VAPID_PUBLIC_KEY,
      }),
      { onConflict: "endpoint" }
    );
  });

  it("saves null for one on the original key", async () => {
    await savePushSubscription("1234", {
      endpoint: "https://push.test/old",
      p256dh: "p",
      auth: "a",
      vapidPublic: null,
    });
    expect(upsert.mock.calls[0][1]).toHaveProperty("vapid_public", null);
  });

  it("drops the row this browser saved before, not the one just saved", async () => {
    localStorage.setItem(PUSH_ENDPOINT_KEY, "https://push.test/old");
    await savePushSubscription("1234", {
      endpoint: "https://push.test/new",
      p256dh: "p",
      auth: "a",
      vapidPublic: VAPID_PUBLIC_KEY,
    });
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith("push_subscriptions", "endpoint", "https://push.test/old");
    expect(localStorage.getItem(PUSH_ENDPOINT_KEY)).toBe("https://push.test/new");
  });
});
