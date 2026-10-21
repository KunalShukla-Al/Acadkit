import { describe, expect, it } from "vitest";
import { macState } from "./mac";

describe("macState", () => {
  it("reads what the Mac tracks, and calls it asleep when it isn't there", () => {
    expect(macState({ mac: [{ state: "awake" }] })).toBe("awake");
    expect(macState({ mac: [{ state: "syncing" }] })).toBe("syncing");
    expect(macState({})).toBe("asleep");
    expect(macState({ mac: [{ state: "dancing" }] })).toBe("asleep");
    expect(macState({ "phone-1": [{ state: "awake" }] })).toBe("asleep");
  });
});
