/**
 * Where the offline copy of the app's data lives: IndexedDB, behind the
 * async storage shape the query persister takes. It outgrew localStorage:
 * the Run-up plan and past-paper topics alone are 2.2 MB of JSON, Safari
 * gives a site about 5 MB of localStorage, and past that every write
 * throws and the offline copy silently stops updating.
 *
 * Where IndexedDB won't open (some private windows), localStorage stands in
 * as before. A value still in localStorage from before the move is read
 * once, moved across and removed, so updating the app keeps what was saved.
 */

export interface AsyncStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const DB = "acadkit";
const STORE = "kv";

/** localStorage, quiet when it isn't there or is full. */
const local: AsyncStore = {
  async getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async setItem(key, value) {
    localStorage.setItem(key, value);
  },
  async removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage disabled: nothing to remove */
    }
  },
};

function openIdb(): Promise<AsyncStore> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      // Reads resolve with the value; writes once the transaction has committed.
      const run = <T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>) =>
        new Promise<T>((done, fail) => {
          const tx = db.transaction(STORE, mode);
          const r = op(tx.objectStore(STORE));
          tx.oncomplete = () => done(r.result);
          tx.onerror = tx.onabort = () => fail(tx.error ?? r.error);
        });
      resolve({
        getItem: async (key) => ((await run("readonly", (s) => s.get(key))) as string | undefined) ?? null,
        setItem: async (key, value) => void (await run("readwrite", (s) => s.put(value, key))),
        removeItem: async (key) => void (await run("readwrite", (s) => s.delete(key))),
      });
    };
  });
}

/** IndexedDB, or localStorage where it won't open; see the top of the file. */
export function offlineStore(open: () => Promise<AsyncStore> = openIdb): AsyncStore {
  const store = open().catch(() => local);
  return {
    async getItem(key) {
      const s = await store;
      const value = await s.getItem(key);
      if (value !== null || s === local) return value;
      const old = await local.getItem(key);
      if (old === null) return null;
      await s.setItem(key, old);
      await local.removeItem(key);
      return old;
    },
    async setItem(key, value) {
      await (await store).setItem(key, value);
    },
    async removeItem(key) {
      await local.removeItem(key);
      await (await store).removeItem(key);
    },
  };
}

let shared: AsyncStore | null = null;

/** The app's one store, opened on first use. */
export function appStore(): AsyncStore {
  return (shared ??= offlineStore());
}
