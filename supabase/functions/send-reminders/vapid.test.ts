import { describe, expect, it } from "vitest";
import { vapidFor, vapidKeys } from "./vapid.ts";

// Stand-ins: the real keys never appear in the repo's tests.
const ENV = {
  VAPID_SUBJECT: "mailto:acadkit@test",
  VAPID_PUBLIC: "original-public",
  VAPID_PRIVATE: "original-private",
  VAPID_PUBLIC_V2: "v2-public",
  VAPID_PRIVATE_V2: "v2-private",
};
const env = (vars: Record<string, string | undefined>) => (name: string) => vars[name];

const ORIGINAL = { subject: "mailto:acadkit@test", publicKey: "original-public", privateKey: "original-private" };
const V2 = { subject: "mailto:acadkit@test", publicKey: "v2-public", privateKey: "v2-private" };

describe("vapidKeys", () => {
  it("reads both pairs", () => {
    expect(vapidKeys(env(ENV))).toEqual({
      subject: "mailto:acadkit@test",
      original: { publicKey: "original-public", privateKey: "original-private" },
      v2: { publicKey: "v2-public", privateKey: "v2-private" },
    });
  });

  it("has no V2 unless both halves are set", () => {
    expect(vapidKeys(env({ ...ENV, VAPID_PUBLIC_V2: undefined })).v2).toBeNull();
    expect(vapidKeys(env({ ...ENV, VAPID_PRIVATE_V2: undefined })).v2).toBeNull();
    expect(vapidKeys(env({ ...ENV, VAPID_PRIVATE_V2: "" })).v2).toBeNull();
    expect(vapidKeys(env({ ...ENV, VAPID_PUBLIC_V2: "  " })).v2).toBeNull();
  });

  it("trims a pasted V2 key", () => {
    expect(vapidKeys(env({ ...ENV, VAPID_PUBLIC_V2: "v2-public\n" })).v2?.publicKey).toBe("v2-public");
  });

  it("drops base64 padding from the V2 public key, as the app stores it bare", () => {
    expect(vapidKeys(env({ ...ENV, VAPID_PUBLIC_V2: "v2-public=\n" })).v2?.publicKey).toBe("v2-public");
  });

  it("keeps the old default subject", () => {
    expect(vapidKeys(env({ ...ENV, VAPID_SUBJECT: undefined })).subject).toBe("mailto:acadkit@example.com");
  });
});

describe("vapidFor", () => {
  const keys = vapidKeys(env(ENV));

  it("signs a subscription made with the V2 key with the V2 pair", () => {
    expect(vapidFor({ vapid_public: "v2-public" }, keys)).toEqual(V2);
  });

  it("signs everything else with the original pair", () => {
    expect(vapidFor({ vapid_public: null }, keys)).toEqual(ORIGINAL);
    // A row read before migration 041 has no such column at all.
    expect(vapidFor({}, keys)).toEqual(ORIGINAL);
    // A key this function doesn't hold: the original is the only sane guess.
    expect(vapidFor({ vapid_public: "some-other-key" }, keys)).toEqual(ORIGINAL);
    expect(vapidFor({ vapid_public: "original-public" }, keys)).toEqual(ORIGINAL);
  });

  it("without the V2 secrets, signs every row with the original pair, as before", () => {
    const before = vapidKeys(env({ ...ENV, VAPID_PUBLIC_V2: undefined, VAPID_PRIVATE_V2: undefined }));
    expect(vapidFor({ vapid_public: "v2-public" }, before)).toEqual(ORIGINAL);
    expect(vapidFor({ vapid_public: null }, before)).toEqual(ORIGINAL);
  });

  it("matches the key exactly", () => {
    expect(vapidFor({ vapid_public: "V2-PUBLIC" }, keys)).toEqual(ORIGINAL);
    expect(vapidFor({ vapid_public: "" }, keys)).toEqual(ORIGINAL);
  });
});
