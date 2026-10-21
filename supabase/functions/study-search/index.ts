// Supabase Edge Function: study-search
//
// Embeds a search query with gte-small and returns the nearest passages
// (match_study_chunks, migration 030) and the nearest moments of recorded
// lectures (match_lecture_moments, migration 061). Queries only: the Mac's sync embeds
// passages itself (scripts/embedder), so this function's CPU budget goes to
// searches.
import { createClient } from "npm:@supabase/supabase-js@2";

const session = new Supabase.ai.Session("gte-small");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function embed(text: string): Promise<number[]> {
  const out = await session.run(text, { mean_pool: true, normalize: true });
  return Array.from(out as ArrayLike<number>);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: { query?: unknown; device_id?: unknown; limit?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const auth = req.headers.get("Authorization");

  const query = String(body.query ?? "").trim().slice(0, 500);
  const pin = String(body.device_id ?? "");
  if (!query) return json({ error: "empty query" }, 400);
  if (!/^\d{4}$/.test(pin)) return json({ error: "device_id must be 4 digits" }, 400);
  const limit = Math.min(Math.max(Number(body.limit) || 12, 1), 30);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth ?? "" } },
    auth: { persistSession: false },
  });
  const vector = await embed(query);
  const [passages, moments] = await Promise.all([
    sb.rpc("match_study_chunks", { p_device: pin, query_embedding: vector, match_count: limit }),
    sb.rpc("match_lecture_moments", { p_device: pin, query_embedding: vector, match_count: 6 }),
  ]);
  if (passages.error) return json({ error: passages.error.message }, 500);
  // Before migration 061 there are no lectures to search: none, rather than an error.
  return json({ results: passages.data ?? [], moments: moments.error ? [] : (moments.data ?? []) });
});
