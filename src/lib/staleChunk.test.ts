/**
 * @vitest-environment happy-dom
 *
 * Needs a real sessionStorage: the reload guard is the part that must
 * not misbehave, and stubbing it would be testing the stub.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { isStaleChunkError, recoverFromStaleChunk, reloadApp, resetStaleChunkState } from "@/lib/staleChunk";

/** The real message that started this, copied out of error_log: a deploy replaced the chunk filenames while the app was open, the SPA rewrite answered the missing file with index.html, and the browser reported HTML where it wanted a module. */
const REAL = new Error(
  "'text/html' is not a valid JavaScript MIME type for module script 'https://acadkit.app/assets/Insights-Bw4BvhjD.js'"
);

describe("isStaleChunkError", () => {
  it("recognises the message this was built for", () => {
    expect(isStaleChunkError(REAL)).toBe(true);
  });

  it("recognises how the other browsers word it", () => {
    for (const m of [
      "Failed to fetch dynamically imported module: https://x/assets/Marks-abc.js",
      "error loading dynamically imported module",
      "Importing a module script failed.",
      "ChunkLoadError: Loading chunk 42 failed.",
      "Loading CSS chunk 7 failed.",
    ]) {
      expect(isStaleChunkError(new Error(m)), m).toBe(true);
      expect(isStaleChunkError(m), m).toBe(true);
    }
  });

  it("leaves real crashes alone", () => {
    // The cost of a false positive is a reload that hides a genuine
    // bug, so this list matters more than the one above.
    for (const m of [
      "Cannot read properties of undefined (reading 'max')",
      "subject.assessment is not a function",
      "Network request failed",
      "Maximum update depth exceeded",
    ]) {
      expect(isStaleChunkError(new Error(m)), m).toBe(false);
    }
    expect(isStaleChunkError(null)).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
    expect(isStaleChunkError({})).toBe(false);
  });
});

describe("recoverFromStaleChunk", () => {
  it("reloads once and then refuses, so it cannot loop", () => {
    sessionStorage.clear();
    const reload = vi.fn();
    expect(recoverFromStaleChunk(reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    // The reloaded page failing again inside the cooldown is a broken
    // deploy, not a stale one - the crash screen should show rather than
    // reload again.
    resetStaleChunkState();
    expect(recoverFromStaleChunk(reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("swallows the other chunks that fail while the same page reloads", () => {
    sessionStorage.clear();
    resetStaleChunkState();
    const reload = vi.fn();
    expect(recoverFromStaleChunk(reload)).toBe(true);
    // Nine more prefetches fail in the same moment: handled, not crashes.
    for (let i = 0; i < 9; i++) expect(recoverFromStaleChunk(reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does nothing while the page is being left, where Safari aborts its imports", () => {
    sessionStorage.clear();
    resetStaleChunkState();
    const reload = vi.fn();
    window.dispatchEvent(new Event("pagehide"));
    expect(recoverFromStaleChunk(reload)).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    // Brought back from the back-forward cache, a stale chunk reloads again.
    window.dispatchEvent(new Event("pageshow"));
    expect(recoverFromStaleChunk(reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("still tries when storage is unavailable", () => {
    sessionStorage.clear();
    resetStaleChunkState();
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const reload = vi.fn();
    // One reload beats a crash screen even with no way to remember it.
    expect(recoverFromStaleChunk(reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

/** A service worker that does what vite-plugin-pwa's does on SKIP_WAITING. */
class FakeWorker extends EventTarget {
  posted: unknown[] = [];
  constructor(
    public state: ServiceWorkerState,
    private container: EventTarget,
  ) {
    super();
  }
  postMessage(message: unknown) {
    this.posted.push(message);
    this.state = "activated";
    this.container.dispatchEvent(new Event("controllerchange"));
  }
  become(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

/** The app's registration as the old shell sees it, with the new build at `next`. */
function fakeRegistration(next?: { state: ServiceWorkerState; slot: "waiting" | "installing" | "update" }) {
  const container = new EventTarget();
  const worker = next && new FakeWorker(next.state, container);
  const registration = {
    waiting: next?.slot === "waiting" ? worker : null,
    installing: next?.slot === "installing" ? worker : null,
    // The update check finds the new build and starts installing it.
    update: vi.fn(async () => {
      if (next?.slot === "update") registration.installing = worker ?? null;
    }),
  };
  vi.stubGlobal("navigator", {
    serviceWorker: Object.assign(container, { getRegistration: async () => registration }),
  });
  return { registration, worker };
}

describe("reloadApp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("hands over to the waiting build before reloading, as closing the app used to", async () => {
    const { registration, worker } = fakeRegistration({ state: "installed", slot: "waiting" });
    const reload = vi.fn();
    await reloadApp(reload);
    expect(worker?.posted).toEqual([{ type: "SKIP_WAITING" }]);
    expect(registration.update).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("checks for the new build when the app hasn't found it yet, and waits for it to install", async () => {
    const { registration, worker } = fakeRegistration({ state: "installing", slot: "update" });
    const reload = vi.fn();
    const done = reloadApp(reload);
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalled());
    expect(worker?.posted).toEqual([]);
    worker?.become("installed");
    await done;
    expect(worker?.posted).toEqual([{ type: "SKIP_WAITING" }]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads without a handover when the new build fails to install", async () => {
    const { worker } = fakeRegistration({ state: "installing", slot: "installing" });
    const reload = vi.fn();
    const done = reloadApp(reload);
    worker?.become("redundant");
    await done;
    expect(worker?.posted).toEqual([]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads anyway when the handover stalls", async () => {
    vi.useFakeTimers();
    fakeRegistration({ state: "installing", slot: "installing" });
    const reload = vi.fn();
    const done = reloadApp(reload);
    await vi.advanceTimersByTimeAsync(7_000);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    await done;
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("just reloads with no service worker, or when the check fails offline", async () => {
    vi.stubGlobal("navigator", {});
    const reload = vi.fn();
    await reloadApp(reload);
    expect(reload).toHaveBeenCalledTimes(1);

    const { registration } = fakeRegistration();
    registration.update.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await reloadApp(reload);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
