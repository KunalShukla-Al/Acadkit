/**
 * Files sent to the Mac's study folder from elsewhere: the app's Upload,
 * and the share sheet through the feeds (supabase/functions/feeds). Both put
 * the bytes in the PIN's inbox and a study_uploads row saying where they go
 * (migration 033); the Mac saves them (scripts/apply-study-uploads.mjs).
 */

/** The bucket's cap (migration 025). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * A file name the sync will pick up: no slashes, and not starting with "."
 * or "_" (the sync skips those) or "~$" (Office lock files).
 */
export function safeUploadName(name: string): string {
  // Control characters are exactly what's being removed.
  // eslint-disable-next-line no-control-regex
  let n = name.replace(/[/\\]/g, "-").replace(/[\u0000-\u001f]/g, "").trim();
  if (/^[._]|^~\$/.test(n)) n = `upload-${n.replace(/^[._~$]+/, "")}`;
  return n || "upload";
}

/** Extensions for what a phone shares, by content type. */
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
  "video/quicktime": "mov",
  "video/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/mp4": "m4a",
};

/** A name with an extension: a photo shared from the Photos app arrives as "IMG_4021", and the sync tags files by theirs. */
export function withExtension(name: string, contentType: string | null): string {
  if (/\.[A-Za-z0-9]{1,5}$/.test(name)) return name;
  const ext = EXTENSIONS[(contentType ?? "").split(";")[0].trim().toLowerCase()];
  return ext ? `${name}.${ext}` : name;
}

