import { useState } from "react";

/**
 * Runs `reset` while rendering whenever `key` changes to anything but null.
 * A sheet passes the row it opens on (null while it is shut), so the form
 * is filled before the first paint, with no effect and no second render.
 */
export function useResetOn<K>(key: K | null, reset: (key: K) => void) {
  const [seen, setSeen] = useState<K | null>(null);
  if (key !== seen) {
    setSeen(key);
    if (key !== null) reset(key);
  }
}
