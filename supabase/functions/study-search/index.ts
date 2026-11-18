// Supabase Edge Function: study-search
//
// Embeds a search query with gte-small and returns the nearest passages
// (match_study_chunks, migration 030). Queries only: the Mac's sync embeds
// passages itself (scripts/embedder), so this function's CPU budget goes to
// searches. The caller must own the PIN before any model work starts.
import { createClient } from "npm:@supabase/supabase-js@2";
import { isRefusal, ownsPin, readSearchRequest } from "./request.ts";

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

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "sign in first" }, 401);

  const request = await readSearchRequest(req);
  if (isRefusal(request)) return json({ error: request.error }, request.status);
  const { query, pin, limit } = request;

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const lookup = (p: string) => sb.from("device_owners").select("device_id").eq("device_id", p).limit(1);
  if (!(await ownsPin(lookup, pin))) return json({ error: "not your PIN" }, 403);

  const vector = await embed(query);
  const passages = await sb.rpc("match_study_chunks", { p_device: pin, query_embedding: vector, match_count: limit });
  if (passages.error) return json({ error: passages.error.message }, 500);
  return json({ results: passages.data ?? [] });
});
