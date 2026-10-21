import { describe, expect, it } from "vitest";
import { searchMany } from "./search.mjs";

type Args = { query_embeddings?: number[][]; query_embedding?: number[] };

/** A database whose passage "k<n>" is the hit for vector [n], at a similarity that falls with each later hit. */
function fake({ batched = true } = {}) {
  const calls: string[] = [];
  const supabase = {
    rpc: async (fn: string, args: Args) => {
      calls.push(fn);
      if (fn === "match_study_chunks_many") {
        if (!batched) return { data: null, error: { code: "PGRST202", message: "Could not find the function public.match_study_chunks_many" } };
        // Rows for a batch come back in no particular order.
        const rows = args.query_embeddings!.flatMap(([n], i) => [
          { query_index: i, file_key: `k${n}b`, page: null, similarity: 0.5 },
          { query_index: i, file_key: `k${n}`, page: 1, similarity: 0.9 },
        ]);
        return { data: rows.reverse(), error: null };
      }
      const [n] = args.query_embedding!;
      return { data: [{ file_key: `k${n}`, page: 1, similarity: 0.9 }], error: null };
    },
  };
  return { supabase, calls };
}

describe("searchMany", () => {
  it("asks once per 50 vectors and hands each its own hits, closest first", async () => {
    const { supabase, calls } = fake();
    const vectors = Array.from({ length: 120 }, (_, n) => [n]);
    const out = await searchMany(supabase, "0404", vectors);
    expect(calls).toEqual(["match_study_chunks_many", "match_study_chunks_many", "match_study_chunks_many"]);
    expect(out).toHaveLength(120);
    expect(out[0].map((h: { file_key: string }) => h.file_key)).toEqual(["k0", "k0b"]);
    expect(out[119].map((h: { file_key: string }) => h.file_key)).toEqual(["k119", "k119b"]);
  });

  it("asks one by one until migration 046 is applied", async () => {
    const { supabase, calls } = fake({ batched: false });
    const out = await searchMany(supabase, "0404", [[1], [2]]);
    expect(calls).toEqual(["match_study_chunks_many", "match_study_chunks", "match_study_chunks"]);
    expect(out.map((hits: { file_key: string }[]) => hits[0].file_key)).toEqual(["k1", "k2"]);
  });

  it("makes no call for no vectors", async () => {
    const { supabase, calls } = fake();
    expect(await searchMany(supabase, "0404", [])).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("stops on any other error", async () => {
    const supabase = { rpc: async () => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }) };
    await expect(searchMany(supabase, "0404", [[1]])).rejects.toThrow(/statement timeout/);
  });
});
