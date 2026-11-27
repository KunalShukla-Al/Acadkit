import type { QueryClient } from "@tanstack/react-query";
import { endAccount } from "@/lib/account";
import { clearDeletedFiles } from "@/lib/deletedFiles";
import { clearFileCache } from "@/lib/fileCache";
import { appStore, type AsyncStore } from "@/lib/offlineStore";
import { clearTomorrow } from "@/lib/tomorrow";

/** Where PersistQueryClientProvider writes the offline cache. */
export const RQ_CACHE_KEY = "acadkit:rq-cache";

/**
 * Wipe what the previous account left on this device. Everything in memory
 * goes at once, before anything can render for the next account: the
 * account is marked ended, so downloads still running stop before their
 * next write; queries in flight are cancelled, so none lands in the
 * cleared client. The promise settles when the copies on disk are gone.
 */
export function resetAfterSignOut(qc: QueryClient, store: AsyncStore = appStore()): Promise<void> {
  endAccount();
  const cancelled = qc.cancelQueries();
  qc.clear();
  clearTomorrow();
  clearDeletedFiles();
  return Promise.all([
    cancelled,
    store.removeItem(RQ_CACHE_KEY).catch(() => {}),
    // Files opened on this device are the account's too (src/lib/fileCache.ts).
    clearFileCache(),
  ]).then(() => {});
}
