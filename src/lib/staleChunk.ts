/** Recovering from a deploy that landed under your feet. */

const RELOAD_KEY = "acadkit:chunk-reload";
/** Long enough to cover a reload; short enough not to suppress a real one later. */
const COOLDOWN_MS = 30_000;

/**
 * Every phrasing the browsers use for "the module you asked for isn't
 * there". Chrome, Firefox and Safari each word it differently, and the
 * MIME variant is the one a SPA rewrite produces rather than a 404.
 */
const SIGNATURES = [
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
  "is not a valid javascript mime type",
  "expected a javascript module script",
  "chunkloaderror",
  "loading chunk",
  "loading css chunk",
];

export function isStaleChunkError(reason: unknown): boolean {
  const message =
    reason instanceof Error
      ? `${reason.name} ${reason.message}`
      : typeof reason === "string"
        ? reason
        : "";
  if (!message) return false;
  const lower = message.toLowerCase();
  return SIGNATURES.some((s) => lower.includes(s));
}

/**
 * Reload to pick up the new build. Returns false when it has already
 * tried recently, so the caller can fall back to showing the crash.
 */
export function recoverFromStaleChunk(reload: () => void = () => void reloadApp()): boolean {
  // Already reloading this page: the other chunks that fail in the same
  // moment are the same stale document, not crashes. After a deploy the
  // Study page's prefetches used to log ten of them in three seconds.
  if (reloading) return true;
  // Leaving the page: Safari aborts its pending imports then, in words that
  // read as a stale build. Reloading would take you back to the page you
  // were leaving, so it's handled by doing nothing.
  if (leaving) return true;
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
  } catch {
    // Private mode, or storage disabled. One reload attempt is still
    // better than a crash screen, so carry on with last = 0.
  }
  if (Date.now() - last < COOLDOWN_MS) return false;
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* nothing to do */
  }
  reloading = true;
  reload();
  return true;
}

/** How long the new build gets to take over before the reload goes ahead anyway. */
const HANDOVER_MS = 8_000;

/**
 * Reload into the newest build. A plain reload keeps the old service
 * worker serving the old shell while the new one waits, and that shell is
 * the build that just failed: only closing the app swapped them. So the
 * waiting worker takes over first, found by an update check if the app
 * hasn't run one yet.
 */
export async function reloadApp(reload: () => void = () => location.reload()): Promise<void> {
  try {
    const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registration) await Promise.race([takeOver(registration), wait(HANDOVER_MS)]);
  } catch {
    // Offline, or the check failed: the reload may still work.
  }
  reload();
}

async function takeOver(registration: ServiceWorkerRegistration): Promise<void> {
  if (!registration.waiting && !registration.installing) await registration.update();
  const next = registration.waiting ?? registration.installing;
  if (!next || !(await installed(next))) return;
  const controlled = new Promise<void>((resolve) =>
    navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }),
  );
  // What vite-plugin-pwa's generated worker listens for.
  next.postMessage({ type: "SKIP_WAITING" });
  await controlled;
}

/** True once the worker has installed, false if it never will. */
function installed(worker: ServiceWorker): Promise<boolean> {
  return new Promise((resolve) => {
    const settle = () => {
      if (worker.state === "redundant") resolve(false);
      else if (worker.state !== "parsed" && worker.state !== "installing") resolve(true);
    };
    worker.addEventListener("statechange", settle);
    settle();
  });
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let reloading = false;
let leaving = false;
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => (leaving = true));
  window.addEventListener("pagehide", () => (leaving = true));
  // Back from the back-forward cache: the same page, here again.
  window.addEventListener("pageshow", () => (leaving = false));
}

/** Tests only: a fresh page. */
export function resetStaleChunkState(): void {
  reloading = false;
  leaving = false;
}
