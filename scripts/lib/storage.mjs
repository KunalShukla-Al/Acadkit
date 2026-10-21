/**
 * The study-files bucket against the free plan's 1 GB of storage. The sync
 * reports what the bucket holds, sends it to the app as <pin>/storage.json
 * (Study's meter), and uploads nothing that would take the bucket
 * past 950 MB, leaving room for the app's uploads and the JSON it writes.
 */

const MB = 1024 * 1024;
export const STORAGE_LIMIT = 1024 * MB;
export const UPLOAD_CAP = 950 * MB;

/** Bytes in the bucket, every account's folders included: storage is the project's, not a PIN's. */
export async function bucketUse(bucket, prefix = "") {
  let bytes = 0;
  for (let offset = 0; ; ) {
    const { data, error } = await bucket.list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`couldn't list ${prefix || "the bucket"}: ${error.message}`);
    for (const o of data ?? []) {
      // A folder has no id; its files are counted inside it.
      if (o.id) bytes += Number(o.metadata?.size ?? 0);
      else bytes += await bucketUse(bucket, prefix ? `${prefix}/${o.name}` : o.name);
    }
    if ((data ?? []).length < 1000) break;
    offset += data.length;
  }
  return bytes;
}

/**
 * Which uploads fit under `cap`, in order, given the bucket's bytes once
 * the sync's removals are done (`base`). A file that doesn't fit is refused
 * and the rest are still tried, so one big scan doesn't hold back a page of
 * notes. `size(f)` is a file's bytes.
 */
export function fitUploads(files, base, { cap = UPLOAD_CAP, size = (f) => f.size } = {}) {
  const accepted = [];
  const refused = [];
  let used = base;
  for (const f of files) {
    const n = size(f);
    if (used + n > cap) refused.push(f);
    else {
      accepted.push(f);
      used += n;
    }
  }
  return { accepted, refused, used };
}
