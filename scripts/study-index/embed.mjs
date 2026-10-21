/**
 * Embeddings for the sync, made on this Mac (scripts/embedder): gte-small,
 * the vectors the study-search edge function makes for search queries.
 * One batch at a time, since the model already uses every core.
 */

const BATCH = 16;
/** @type {Promise<unknown>} */
let queue = Promise.resolve();

async function load() {
  try {
    return (await import("../embedder/index.mjs")).embed;
  } catch (err) {
    if (err?.code === "ERR_MODULE_NOT_FOUND") throw new Error("the embedder isn't installed: npm ci --prefix scripts/embedder");
    throw err;
  }
}

/** One vector per text, in order. Texts past 4,000 characters are cut, as the edge function cut them. */
export async function embedTexts(texts) {
  const embed = await load();
  const run = queue.then(async () => {
    const out = [];
    for (let i = 0; i < texts.length; i += BATCH) out.push(...(await embed(texts.slice(i, i + BATCH).map((t) => String(t).slice(0, 4000)))));
    return out;
  });
  queue = run.catch(() => {});
  return run;
}
