/**
 * Transcripts to the app (migration 061): each lecture the recorder kept
 * (scripts/lib/recorder.mjs) and its moments, with their gte-small vectors,
 * so the app shows what was said and study search finds it. The audio and
 * whisper's segments stay on the Mac.
 */
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { STATE_DIR } from "./recorder.mjs";

const BATCH = 100;
const missingTable = (e) => e?.code === "42P01" || e?.code === "PGRST205";

/** A transcript file as its lectures row and moment rows (without lecture_id). */
export function lectureRows(pin, t) {
  const words = (t.segments ?? []).reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
  const lecture = {
    device_id: pin,
    memo: t.memo,
    date: t.date,
    start_time: t.time,
    seconds: t.seconds ?? null,
    subject_code: t.class?.code ?? null,
    class_start: t.class?.start ?? null,
    class_end: t.class?.end ?? null,
    deck: t.deck ?? null,
    words,
  };
  const moments = (t.moments ?? []).map((m, idx) => ({
    device_id: pin,
    idx,
    start_s: m.start,
    end_s: m.end,
    content: m.text,
    page: m.page ?? null,
    similarity: m.similarity ?? null,
    embedding: m.vector ?? null,
  }));
  return { lecture, moments };
}

/**
 * The tick's step: every transcript new or changed since it was last sent,
 * sent again whole. Before migration 061 is live it waits, quietly.
 * Returns the memos sent.
 */
export async function syncLectures({ supabase, pin, stateDir = STATE_DIR, log = console.log }) {
  const dir = path.join(stateDir, "transcripts");
  const names = (await readdir(dir).catch(() => [])).filter((n) => n.endsWith(".json")).sort();
  if (!names.length) return [];
  const ledger = path.join(stateDir, "synced.json");
  const synced = JSON.parse(await readFile(ledger, "utf8").catch(() => "{}"));
  const sent = [];
  for (const name of names) {
    const full = path.join(dir, name);
    const { mtimeMs } = await stat(full);
    if (synced[name] === mtimeMs) continue;
    const { lecture, moments } = lectureRows(pin, JSON.parse(await readFile(full, "utf8")));

    const up = await supabase.from("lectures").upsert(lecture, { onConflict: "device_id,memo" }).select("id").single();
    if (missingTable(up.error)) return sent;
    if (up.error) throw new Error(`Couldn't send the lecture ${lecture.memo}: ${up.error.message}`);
    const id = up.data.id;
    const gone = await supabase.from("lecture_moments").delete().eq("lecture_id", id);
    if (gone.error) throw new Error(`Couldn't clear ${lecture.memo}'s moments: ${gone.error.message}`);
    for (let i = 0; i < moments.length; i += BATCH) {
      const { error } = await supabase.from("lecture_moments").insert(moments.slice(i, i + BATCH).map((m) => ({ ...m, lecture_id: id })));
      if (error) throw new Error(`Couldn't send ${lecture.memo}'s moments: ${error.message}`);
    }

    synced[name] = mtimeMs;
    await mkdir(stateDir, { recursive: true });
    await writeFile(ledger, JSON.stringify(synced, null, 1));
    log(`  Recorder: sent ${lecture.memo} to the app, ${moments.length} moment${moments.length === 1 ? "" : "s"}`);
    sent.push(lecture.memo);
  }
  return sent;
}
