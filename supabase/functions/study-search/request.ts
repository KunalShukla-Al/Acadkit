// Everything study-search checks before it spends CPU on an embedding.

/** A search body is a query, a PIN and a count; anything bigger is not a search. */
export const MAX_BODY_BYTES = 4096;

export interface SearchRequest {
  query: string;
  pin: string;
  limit: number;
}

export type Refusal = { error: string; status: number };

export async function readSearchRequest(req: Request): Promise<SearchRequest | Refusal> {
  if (Number(req.headers.get("Content-Length") ?? 0) > MAX_BODY_BYTES) return { error: "request too large", status: 413 };

  // The header can be missing or wrong, so the bytes are counted too.
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return { error: "request too large", status: 413 };

  let body: { query?: unknown; device_id?: unknown; limit?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return { error: "bad json", status: 400 };
  }
  if (!body || typeof body !== "object") return { error: "bad json", status: 400 };

  const query = String(body.query ?? "").trim().slice(0, 500);
  const pin = String(body.device_id ?? "");
  if (!query) return { error: "empty query", status: 400 };
  if (!/^\d{4}$/.test(pin)) return { error: "device_id must be 4 digits", status: 400 };
  return { query, pin, limit: Math.min(Math.max(Number(body.limit) || 12, 1), 30) };
}

/** The one query ownsPin makes, so a test can stand in for the client. */
export type OwnerLookup = (pin: string) => PromiseLike<{ data: unknown; error: unknown }>;

/**
 * True only when the caller's session owns the PIN. device_owners shows each
 * signed-in user just their own rows and the anon key none, so a row coming
 * back is the proof.
 */
export async function ownsPin(lookup: OwnerLookup, pin: string): Promise<boolean> {
  try {
    const { data, error } = await lookup(pin);
    return !error && Array.isArray(data) && data.length === 1;
  } catch {
    return false;
  }
}

export function isRefusal(r: SearchRequest | Refusal): r is Refusal {
  return "error" in r;
}
