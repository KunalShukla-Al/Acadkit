import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { accountEpoch } from "@/lib/account";
import { RQ_CACHE_KEY, resetAfterSignOut } from "@/lib/accountReset";
import { cachedFile, isCached, storeFile } from "@/lib/fileCache";
import type { AsyncStore } from "@/lib/offlineStore";

/** CacheStorage as the browser has it: a deleted cache's object stays usable but is no longer found by name. */
function fakeCaches() {
  const stores = new Map<string, FakeCache>();
  class FakeCache {
    entries = new Map<string, Response>();
    gate: Promise<void> | null = null;
    async put(url: string, res: Response) {
      if (this.gate) await this.gate;
      this.entries.set(url, res);
    }
    async match(url: string) {
      return this.entries.get(url);
    }
    async delete(url: string) {
      return this.entries.delete(url);
    }
  }
  return {
    stores,
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new FakeCache());
      return stores.get(name)!;
    },
    async delete(name: string) {
      return stores.delete(name);
    },
  };
}

function fakeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

function fakeStore(): AsyncStore & { removed: string[] } {
  const removed: string[] = [];
  return {
    removed,
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async (k) => void removed.push(k),
  };
}

let caches: ReturnType<typeof fakeCaches>;
let storage: ReturnType<typeof fakeLocalStorage>;

beforeEach(() => {
  caches = fakeCaches();
  storage = fakeLocalStorage();
  vi.stubGlobal("caches", caches);
  vi.stubGlobal("localStorage", storage);
});
afterEach(() => vi.unstubAllGlobals());

const blob = () => new Blob(["old account's notes"], { type: "application/pdf" });

describe("the file cache across a sign-out", () => {
  it("keeps a file while the account it was fetched for is signed in", async () => {
    await storeFile("pin/a.pdf", blob(), accountEpoch());
    expect(await isCached("pin/a.pdf")).toBe(true);
  });

  it("drops a download that lands after sign-out instead of refilling the cleared cache", async () => {
    const started = accountEpoch();
    await resetAfterSignOut(new QueryClient(), fakeStore());
    await storeFile("pin/late.pdf", blob(), started);
    expect(await isCached("pin/late.pdf")).toBe(false);
    expect(storage.getItem("acadkit:file-cache")).toBeNull();
  });

  it("takes back a copy whose write was under way when the account signed out", async () => {
    const cache = await caches.open("acadkit-files-v1");
    let release!: () => void;
    cache.gate = new Promise((r) => (release = r));
    const writing = storeFile("pin/mid.pdf", blob(), accountEpoch());
    await Promise.resolve();
    const reset = resetAfterSignOut(new QueryClient(), fakeStore());
    release();
    await Promise.all([writing, reset]);
    expect(await cachedFile("pin/mid.pdf")).toBeNull();
    // The index the clear removed isn't written back with the old file in it.
    expect(storage.getItem("acadkit:file-cache")).toBeNull();
  });
});

describe("resetAfterSignOut", () => {
  it("clears the client, the persisted copy, the cached files and the evening run's summary", async () => {
    await storeFile("pin/a.pdf", blob(), accountEpoch());
    storage.setItem("acadkit:tomorrow", JSON.stringify({ date: "2026-11-26", files: 3, ready: 3, bytes: 10, at: 1 }));
    const qc = new QueryClient();
    qc.setQueryData(["subjects", "pin"], [{ id: "os" }]);
    const store = fakeStore();

    await resetAfterSignOut(qc, store);

    expect(qc.getQueryCache().getAll()).toHaveLength(0);
    expect(store.removed).toEqual([RQ_CACHE_KEY]);
    expect(caches.stores.has("acadkit-files-v1")).toBe(false);
    expect(storage.getItem("acadkit:tomorrow")).toBeNull();
  });

  it("lets no query in flight land in the cleared client", async () => {
    const qc = new QueryClient();
    let answer!: (v: string[]) => void;
    const inFlight = qc
      .fetchQuery({ queryKey: ["marks", "pin"], queryFn: () => new Promise<string[]>((r) => (answer = r)) })
      .catch(() => null);
    await Promise.resolve();
    await resetAfterSignOut(qc, fakeStore());
    answer(["old account's marks"]);
    await inFlight;
    expect(qc.getQueryData(["marks", "pin"])).toBeUndefined();
  });

  it("settles even when the persisted copy can't be removed", async () => {
    const store = { ...fakeStore(), removeItem: () => Promise.reject(new Error("blocked")) };
    await expect(resetAfterSignOut(new QueryClient(), store)).resolves.toBeUndefined();
  });
});
