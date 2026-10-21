/**
 * The Mac's own model, through Ollama: Qwen3-VL reads photos and PDF pages
 * and answers in JSON. Ollama holds the answer to a JSON schema while it is
 * written; checkSchema checks it again here, so a reply that still doesn't
 * fit is asked for once more and then refused, never half-used. Nothing
 * leaves the Mac.
 */

export const MODEL = "qwen3-vl:8b-instruct";
export const HOST = "http://127.0.0.1:11434";
/** An answer runs to a few hundred tokens; one that doesn't stop is looping, and is cut off to be asked again. */
const MAX_TOKENS = 1024;

/**
 * How long one answer may take: a minute for the prompt and a page's image,
 * then 90 ms a token, so an answer can always reach its cap (the M2 writes
 * about 13 tokens a second); never under three minutes.
 */
export const timeoutFor = (maxTokens) => Math.max(180_000, 60_000 + maxTokens * 90);

const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
const fits = (v, type) => typeOf(v) === type || (type === "number" && typeOf(v) === "integer");

/**
 * What in `value` breaks `schema`, as "at: problem" lines (none when it fits).
 * The JSON Schema the prompts use: type (one or a list), enum, properties,
 * required, additionalProperties: false, items, minimum, maximum, pattern.
 */
export function checkSchema(value, schema, at = "answer") {
  const types = schema.type === undefined ? null : [schema.type].flat();
  if (types && !types.some((t) => fits(value, t))) return [`${at}: expected ${types.join(" or ")}, got ${typeOf(value)}`];
  if (schema.enum && !schema.enum.includes(value)) return [`${at}: ${JSON.stringify(value)} is not one of ${schema.enum.map((e) => JSON.stringify(e)).join(", ")}`];
  const errors = [];
  if (typeOf(value) === "object") {
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${at}.${key}: missing`);
    for (const [key, v] of Object.entries(value)) {
      const sub = schema.properties?.[key];
      if (sub) errors.push(...checkSchema(v, sub, `${at}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${at}.${key}: not expected`);
    }
  }
  if (typeOf(value) === "array" && schema.items) value.forEach((v, i) => errors.push(...checkSchema(v, schema.items, `${at}[${i}]`)));
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at}: above ${schema.maximum}`);
  }
  if (typeof value === "string" && schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${at}: doesn't match ${schema.pattern}`);
  return errors;
}

/** Whether Ollama is running here with `model` pulled. */
export async function modelReady({ host = HOST, model = MODEL, fetch = globalThis.fetch } = {}) {
  try {
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) return false;
    const { models = [] } = await res.json();
    return models.some((m) => m.name === model || m.model === model);
  } catch {
    return false;
  }
}

/**
 * One question to the model, with optional images (base64), answered as
 * JSON that fits `schema`. A reply that doesn't fit is asked for again with
 * what was wrong, `tries` times in all; then it throws. `maxTokens` caps the
 * reply: raise it for an answer that lists a lot (a page of questions).
 */
export async function ask({ prompt, images = [], schema, host = HOST, model = MODEL, fetch = globalThis.fetch, tries = 2, maxTokens = MAX_TOKENS, timeoutMs = timeoutFor(maxTokens) }) {
  const messages = [{ role: "user", content: prompt, ...(images.length ? { images } : {}) }];
  let problem = "";
  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Temperature 0: the same file gets the same answer. Kept loaded for ten
      // minutes, since an inbox usually holds more than one file.
      body: JSON.stringify({ model, messages, format: schema, stream: false, keep_alive: "10m", options: { temperature: 0, num_predict: maxTokens } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Ollama answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const reply = (await res.json()).message?.content ?? "";
    let value;
    try {
      value = JSON.parse(reply);
    } catch {
      problem = "it wasn't JSON";
    }
    if (value !== undefined) {
      const errors = checkSchema(value, schema);
      if (!errors.length) return value;
      problem = errors.slice(0, 5).join("; ");
    }
    messages.push({ role: "assistant", content: reply }, { role: "user", content: `That answer doesn't fit (${problem}). Answer again, in JSON that fits.` });
  }
  throw new Error(`The model's answer didn't fit after ${tries} tries: ${problem}`);
}
