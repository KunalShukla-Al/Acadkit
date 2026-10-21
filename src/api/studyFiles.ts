import { supabase } from "@/lib/supabase";
import { cachedFile, isCached, storeFile } from "@/lib/fileCache";
import { MAX_UPLOAD_BYTES, safeUploadName } from "@acadkit/core/uploads";
import { baseName, type StorageData, type StudyFile, type StudyHit, type StudyManifest } from "@/lib/studyFiles";
import type { PrepData, TopicsData, TopicsIndex } from "@/lib/examPrep";
import type { NoticesData, ProjectsData } from "@/lib/thisWeek";
import type { LectureHit } from "@/lib/lectures";
import { shownFile } from "@/lib/viewer";

const BUCKET = "study-files";

/** The synced folder for this PIN, or null if the Mac has never synced. */
export async function fetchStudyManifest(pin: string): Promise<StudyManifest | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(`${pin}/manifest.json`);
  if (error) {
    // Storage answers "not found" with a 400 whose message says so; that
    // is the empty state, not a failure.
    if (/not.?found|does not exist/i.test(error.message)) return null;
    throw error;
  }
  return JSON.parse(await data.text()) as StudyManifest;
}

/** A JSON object in this PIN's storage, or null when it isn't there. */
async function storedJson<T>(key: string): Promise<T | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(key);
  if (error) {
    if (/not.?found|does not exist/i.test(error.message)) return null;
    throw error;
  }
  return JSON.parse(await data.text()) as T;
}

/** Where the Mac is with moving to the next semester's folder. */
export interface SemesterSwitchStatus {
  state: "running" | "done" | "failed";
  from?: string;
  to?: string;
  message?: string;
  at: number;
}

export async function fetchSemesterSwitch(pin: string): Promise<SemesterSwitchStatus | null> {
  return storedJson<SemesterSwitchStatus>(`${pin}/semester-switch.json`);
}

/** A switch the app asked for that the Mac hasn't picked up yet: the semester it asks for, or null. */
export async function fetchPendingSemesterSwitch(pin: string): Promise<number | null> {
  const { data, error } = await supabase.storage.from(BUCKET).list(`${pin}/inbox`, { limit: 1000 });
  if (error) throw error;
  const asks = (data ?? []).filter((o) => /^semester-switch-.*\.json$/.test(o.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (asks.length === 0) return null;
  const body = await storedJson<{ to?: number }>(`${pin}/inbox/${asks[asks.length - 1].name}`);
  return typeof body?.to === "number" ? body.to : null;
}

/**
 * Ask the Mac to move to semester `to`'s folder (~/Documents/SRM_Sem<to>).
 * A note in this PIN's inbox, the one place the app may write; the Mac's
 * next auto-sync (every 3 minutes) acts on it and reports in
 * <pin>/semester-switch.json.
 */
export async function requestSemesterSwitch(pin: string, to: number): Promise<void> {
  const body = JSON.stringify({ to, requestedAt: Date.now() });
  const { error } = await supabase.storage.from(BUCKET).upload(`${pin}/inbox/semester-switch-${Date.now()}.json`, body, {
    contentType: "application/json",
  });
  if (error) throw error;
}

const LINK_SECONDS = 60 * 60;

/** The index of topics mined from past papers (scripts/study-index/topics.mjs), or all of them from a sync before the split; null before it has run. */
export async function fetchStudyTopics(pin: string): Promise<TopicsIndex | TopicsData | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(`${pin}/topics.json`);
  if (error) {
    if (/not.?found|does not exist/i.test(error.message)) return null;
    throw error;
  }
  return JSON.parse(await data.text()) as TopicsData;
}

/** Which earlier units each unit leans on (the past-paper export, via the sync), or null before it has sent any. */
export async function fetchPrereqs(pin: string): Promise<import("@/lib/prereqs").PrereqsData | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(`${pin}/prereqs.json`);
  if (error) {
    if (/not.?found|does not exist/i.test(error.message)) return null;
    throw error;
  }
  return JSON.parse(await data.text());
}

/** The scan's exam prep for this PIN, or null before any sync has written it. */
export async function fetchStudyPrep(pin: string): Promise<PrepData | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(`${pin}/prep.json`);
  if (error) {
    if (/not.?found|does not exist/i.test(error.message)) return null;
    throw error;
  }
  return JSON.parse(await data.text()) as PrepData;
}

/** The weekly scan's notices (scripts/lib/weekly.mjs), or null before any sync has sent them. */
export async function fetchStudyNotices(pin: string): Promise<NoticesData | null> {
  return storedJson<NoticesData>(`${pin}/notices.json`);
}

/** What the bucket holds against the free plan's 1 GB (scripts/lib/storage.mjs), or null before a sync has measured it. */
export async function fetchStudyStorage(pin: string): Promise<StorageData | null> {
  return storedJson<StorageData>(`${pin}/storage.json`);
}

/** The run-up's index (scripts/lib/runup.mjs), or the whole plan from a sync before the split; null before any sync has sent one. */
export async function fetchRunup(pin: string): Promise<import("@/lib/runup").RunupIndex | import("@/lib/runup").RunupFileV1 | null> {
  return storedJson(`${pin}/runup.json`);
}

/** The index of what links to what (scripts/lib/links.mjs), or null before a sync has sent it. */
export async function fetchLinksIndex(pin: string): Promise<import("@/lib/connected").LinksIndex | null> {
  return storedJson(`${pin}/links.json`);
}

/** One of the parts a run-up, topics or links index names (scripts/lib/parts.mjs). Never changes: its name is its content's hash. */
export async function fetchPart<T>(pin: string, name: string): Promise<T> {
  const part = await storedJson<T>(`${pin}/${name}`);
  if (!part) throw new Error(`${name} isn't there`);
  return part;
}

/** The flashcards (scripts/lib/cards.mjs), or null before any sync has sent them. */
export async function fetchCards(pin: string): Promise<import("@/lib/flashcards").CardsData | null> {
  return storedJson(`${pin}/cards.json`);
}

/** Where my projects stand and my to-dos (scripts/lib/weekly.mjs), or null before any sync has sent them. */
export async function fetchStudyProjects(pin: string): Promise<ProjectsData | null> {
  return storedJson<ProjectsData>(`${pin}/projects.json`);
}

/**
 * Passages nearest to a query by meaning, and the lecture moments nearest
 * it, from the study-search edge function (gte-small embeddings,
 * migrations 030 and 061). It runs as you, so row-level security limits
 * it to your own files and lectures.
 */
export async function searchStudyFiles(pin: string, query: string): Promise<{ hits: StudyHit[]; moments: LectureHit[] }> {
  const { data, error } = await supabase.functions.invoke("study-search", {
    body: { query, device_id: pin, limit: 24 },
  });
  if (error) throw error;
  const found = data as { results?: StudyHit[]; moments?: LectureHit[] } | null;
  return { hits: found?.results ?? [], moments: found?.moments ?? [] };
}

/** A file you deleted in the app, waiting for (or just handled by) the Mac. Migration 032. */
export interface StudyDeletion {
  id: string;
  path: string;
  status: "pending" | "done" | "skipped";
  note: string | null;
  done_at: string | null;
}

/**
 * Open delete requests, plus any the Mac turned down in the last day, so
 * the page can say why a file you deleted is still there.
 */
export async function fetchStudyDeletions(pin: string): Promise<StudyDeletion[]> {
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data, error } = await supabase
    .from("study_file_deletions")
    .select("id, path, status, note, done_at")
    .eq("device_id", pin)
    .or(`status.eq.pending,and(status.eq.skipped,done_at.gte.${since})`)
    .order("requested_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Ask the Mac to delete a file. It moves it to its Trash at the next sync,
 * but only if the file still has this content (`key`).
 */
export async function requestStudyDeletion(pin: string, file: StudyFile): Promise<void> {
  const { error } = await supabase
    .from("study_file_deletions")
    .insert({ device_id: pin, path: file.path, key: file.key });
  // A second tap on the same file: the request is already open.
  if (error && error.code !== "23505") throw error;
}

/**
 * A folder: one request per file in it, in one insert. Files that already
 * have an open request are left out, since one duplicate would fail the lot.
 */
export async function requestStudyDeletions(pin: string, files: StudyFile[], alreadyPending: Set<string>): Promise<void> {
  const rows = files.filter((f) => !alreadyPending.has(f.path)).map((f) => ({ device_id: pin, path: f.path, key: f.key }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("study_file_deletions").insert(rows);
  if (error && error.code !== "23505") throw error;
}

/** Take back a request the Mac hasn't acted on yet. */
export async function cancelStudyDeletion(id: string): Promise<void> {
  const { error } = await supabase.from("study_file_deletions").delete().eq("id", id).eq("status", "pending");
  if (error) throw error;
}

/** When the Mac last ran each job (scripts/lib/jobs.mjs), or null before it has said. */
export async function fetchMacJobs(pin: string): Promise<import("@/lib/macJobs").MacJobsData | null> {
  return storedJson(`${pin}/jobs.json`);
}

/** When the Mac last checked in (epoch ms), or null if it never has. Written at most every 30 min. */
export async function fetchMacHeartbeat(pin: string): Promise<number | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(`${pin}/heartbeat.json`);
  if (error) {
    if (/not.?found|does not exist/i.test(error.message)) return null;
    throw error;
  }
  const at = (JSON.parse(await data.text()) as { at?: number }).at;
  return typeof at === "number" ? at : null;
}

/** A file sent from the app, waiting for the Mac to save it into the folder. Migration 033. */
export interface StudyUpload {
  id: string;
  path: string;
  key: string;
  size: number;
}

export async function fetchPendingUploads(pin: string): Promise<StudyUpload[]> {
  const { data, error } = await supabase
    .from("study_uploads")
    .select("id, path, key, size")
    .eq("device_id", pin)
    .eq("status", "pending")
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

/**
 * Send a file to the Mac's study folder, into `folder` ("" = the top). The
 * bytes go to this PIN's inbox; the row tells the Mac where to put them.
 */
export async function uploadStudyFile(pin: string, folder: string, file: File): Promise<void> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is over 50 MB`);
  const name = safeUploadName(file.name);
  const key = `${pin}/inbox/${crypto.randomUUID()}/${name}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(key, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) throw upErr;
  const { error } = await supabase
    .from("study_uploads")
    .insert({ device_id: pin, path: folder ? `${folder}/${name}` : name, key, size: file.size });
  if (error) {
    await supabase.storage.from(BUCKET).remove([key]);
    throw error;
  }
}

/** Take back an upload the Mac hasn't saved yet. */
export async function cancelStudyUpload(u: StudyUpload): Promise<void> {
  const { error } = await supabase.from("study_uploads").delete().eq("id", u.id).eq("status", "pending");
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([u.key]);
}

/** The degree's curriculum from the study folder, or null if the sync hasn't sent one. */
export async function fetchCurriculum(pin: string): Promise<import("@/lib/curriculum").Curriculum | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(`${pin}/curriculum.json`);
  if (error) {
    if (/not.?found|does not exist/i.test(error.message)) return null;
    throw error;
  }
  return JSON.parse(await data.text());
}

/** A file's bytes, for the in-app viewer. */
export async function fetchStudyBlob(file: StudyFile, key: string = file.key): Promise<Blob> {
  // Opened before on this device: no download (src/lib/fileCache.ts).
  const hit = await cachedFile(key);
  if (hit) return hit;
  const { data, error } = await supabase.storage.from(BUCKET).download(key);
  if (error) throw error;
  void storeFile(key, data);
  return data;
}

/**
 * Put what the viewer would show for `file` on this device ahead of time
 * (Tomorrow offline). True once it's there; false when it couldn't be.
 */
export async function keepStudyFile(file: StudyFile): Promise<boolean> {
  const { key } = shownFile(file);
  if (await isCached(key)) return true;
  const { data, error } = await supabase.storage.from(BUCKET).download(key);
  if (error) return false;
  await storeFile(key, data);
  return isCached(key);
}

/**
 * The link the viewer's Download button uses: signed, and always carrying
 * the file's real name, since the blob itself is named by its hash.
 */
export async function studyDownloadUrl(file: StudyFile): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.key, LINK_SECONDS, { download: baseName(file.path) });
  if (error) throw error;
  return data.signedUrl;
}
