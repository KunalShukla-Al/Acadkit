import { beforeEach, describe, expect, it } from "vitest";
import { offlineStore, type AsyncStore } from "./offlineStore";

/** An IndexedDB stand-in: a Map behind the same async shape. */
function memoryDb() {
  const map = new Map<string, string>();
  const store: AsyncStore = {
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => void map.set(k, v),
    removeItem: async (k) => void map.delete(k),
  };
  return { map, open: async () => store };
}

beforeEach(() => localStorage.clear());

describe("offlineStore", () => {
  it("keeps values in IndexedDB, not localStorage", async () => {
    const db = memoryDb();
    const s = offlineStore(db.open);
    await s.setItem("acadkit:rq-cache", "{}");
    expect(db.map.get("acadkit:rq-cache")).toBe("{}");
    expect(localStorage.getItem("acadkit:rq-cache")).toBeNull();
    expect(await s.getItem("acadkit:rq-cache")).toBe("{}");
  });

  it("moves a value saved before the switch out of localStorage on first read", async () => {
    localStorage.setItem("acadkit:rq-cache", '{"clientState":1}');
    const db = memoryDb();
    const s = offlineStore(db.open);
    expect(await s.getItem("acadkit:rq-cache")).toBe('{"clientState":1}');
    expect(db.map.get("acadkit:rq-cache")).toBe('{"clientState":1}');
    expect(localStorage.getItem("acadkit:rq-cache")).toBeNull();
    expect(await s.getItem("missing")).toBeNull();
  });

  it("removes a key from both places, so signing out leaves nothing behind", async () => {
    const db = memoryDb();
    const s = offlineStore(db.open);
    await s.setItem("k", "new");
    localStorage.setItem("k", "old");
    await s.removeItem("k");
    expect(db.map.has("k")).toBe(false);
    expect(localStorage.getItem("k")).toBeNull();
  });

  it("falls back to localStorage where IndexedDB won't open", async () => {
    const s = offlineStore(() => Promise.reject(new Error("InvalidStateError")));
    await s.setItem("k", "v");
    expect(localStorage.getItem("k")).toBe("v");
    expect(await s.getItem("k")).toBe("v");
  });
});
