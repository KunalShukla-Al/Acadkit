/**
 * gte-small on this Mac, through transformers.js: the fp32 ONNX export of
 * the model the study-search edge function runs, mean-pooled and
 * normalised the same way, so its vectors match the function's (cosine
 * 1.000000 on 60 syllabus texts the function had embedded). The model
 * (130 MB) downloads once into AcadKit's cache folder.
 *
 * A package of its own because onnxruntime-node is 290 MB that only the
 * Mac needs: npm ci --prefix scripts/embedder.
 */
import { homedir } from "node:os";
import path from "node:path";
import { env, pipeline } from "@huggingface/transformers";

env.cacheDir = path.join(homedir(), "Library", "Caches", "AcadKit", "models");

let extractor = null;

/** One 384-number unit vector per text. */
export async function embed(texts) {
  extractor ??= pipeline("feature-extraction", "Supabase/gte-small", { dtype: "fp32" });
  const out = await (await extractor)(texts, { pooling: "mean", normalize: true });
  return out.tolist();
}
