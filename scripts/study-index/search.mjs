/** Nearest passages for many query vectors at once (match_study_chunks_many, migration 046). */

/** Queries per call; the function takes at most 100. */
const BATCH = 50;
const missingFunction = (e) => e?.code === "PGRST202" || /could not find the function/i.test(e?.message ?? "");

/**
 * One list of hits per vector, closest first: `{ file_key, chunk_index,
 * page, similarity }`. Before migration 046 is applied, it asks
 * match_study_chunks once per vector, as the sync used to.
 */
export async function searchMany(supabase, pin, vectors, { matchCount = 50 } = {}) {
  const out = vectors.map(() => []);
  for (let lo = 0; lo < vectors.length; lo += BATCH) {
    const batch = vectors.slice(lo, lo + BATCH);
    const { data, error } = await supabase.rpc("match_study_chunks_many", { p_device: pin, query_embeddings: batch, match_count: matchCount });
    if (missingFunction(error)) {
      for (const [i, v] of batch.entries()) {
        const one = await supabase.rpc("match_study_chunks", { p_device: pin, query_embedding: v, match_count: matchCount });
        if (one.error) throw new Error(one.error.message);
        out[lo + i] = one.data ?? [];
      }
      continue;
    }
    if (error) throw new Error(error.message);
    for (const hit of data ?? []) out[lo + hit.query_index]?.push(hit);
  }
  for (const hits of out) hits.sort((a, b) => b.similarity - a.similarity);
  return out;
}
