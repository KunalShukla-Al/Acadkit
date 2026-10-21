/**
 * JSON the app loads in parts (the Run-up, past-paper topics): an index
 * naming files that are named by their content's hash, so a part never
 * changes and the app keeps every one it has fetched.
 */
import { createHash } from "node:crypto";

/** `{ name: "<dir>/<stem>-<hash>.json", json }`. */
export function contentPart(dir, stem, data) {
  const json = JSON.stringify(data);
  const hash = createHash("sha256").update(json).digest("hex").slice(0, 12);
  return { name: `${dir}/${String(stem).replace(/[^A-Za-z0-9_-]/g, "_")}-${hash}.json`, json };
}
