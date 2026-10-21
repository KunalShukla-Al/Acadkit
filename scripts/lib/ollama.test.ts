import { describe, expect, it } from "vitest";
import { ask, checkSchema, modelReady, timeoutFor } from "./ollama.mjs";

const SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["notice", "notes", "other"] },
    subject: { type: ["string", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    events: { type: "array", items: { type: "object", properties: { date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } }, required: ["date"] } },
  },
  required: ["kind", "subject", "confidence"],
  additionalProperties: false,
};

/** A stand-in for Ollama that answers each /api/chat with the next reply, and keeps what it was sent. */
function fakeOllama(replies: string[], status = 200) {
  const sent: { messages: { role: string; content: string; images?: string[] }[]; format: unknown }[] = [];
  const fetch = async (url: string, init?: { body?: string }) => {
    if (url.endsWith("/api/tags")) return new Response(JSON.stringify({ models: [{ name: "qwen3-vl:8b-instruct" }] }));
    sent.push(JSON.parse(init!.body!));
    const content = replies.shift() ?? "";
    return new Response(status === 200 ? JSON.stringify({ message: { role: "assistant", content } }) : "model not found", { status });
  };
  return { fetch: fetch as unknown as typeof globalThis.fetch, sent };
}

describe("checkSchema", () => {
  it("passes what fits", () => {
    expect(checkSchema({ kind: "notice", subject: null, confidence: 0.9, events: [{ date: "2026-10-29" }] }, SCHEMA)).toEqual([]);
    expect(checkSchema({ kind: "notes", subject: "21CSC202J", confidence: 1 }, SCHEMA)).toEqual([]);
  });

  it("says what doesn't, and where", () => {
    expect(checkSchema({ kind: "poster", subject: 3, confidence: 1.4, extra: true }, SCHEMA)).toEqual([
      'answer.kind: "poster" is not one of "notice", "notes", "other"',
      "answer.subject: expected string or null, got integer",
      "answer.confidence: above 1",
      "answer.extra: not expected",
    ]);
    expect(checkSchema({ kind: "notice", confidence: 0.5, events: [{ date: "29 Oct" }] }, SCHEMA)).toEqual([
      "answer.subject: missing",
      "answer.events[0].date: doesn't match ^\\d{4}-\\d{2}-\\d{2}$",
    ]);
    expect(checkSchema([], SCHEMA)).toEqual(["answer: expected object, got array"]);
  });
});

describe("ask", () => {
  it("sends the prompt, the images and the schema, and returns the answer", async () => {
    const { fetch, sent } = fakeOllama(['{"kind":"notice","subject":null,"confidence":0.8}']);
    const value = await ask({ prompt: "What is this?", images: ["aGk="], schema: SCHEMA, fetch });
    expect(value).toEqual({ kind: "notice", subject: null, confidence: 0.8 });
    expect(sent[0].format).toEqual(SCHEMA);
    expect(sent[0].messages).toEqual([{ role: "user", content: "What is this?", images: ["aGk="] }]);
  });

  it("asks again with what was wrong, then takes an answer that fits", async () => {
    const { fetch, sent } = fakeOllama(['{"kind":"poster","subject":null,"confidence":0.8}', '{"kind":"other","subject":null,"confidence":0.8}']);
    expect(await ask({ prompt: "What is this?", schema: SCHEMA, fetch })).toMatchObject({ kind: "other" });
    expect(sent[1].messages.at(-1)!.content).toContain('"poster" is not one of');
  });

  it("refuses an answer that still doesn't fit", async () => {
    const { fetch } = fakeOllama(["not json", '{"kind":"notice"}']);
    await expect(ask({ prompt: "?", schema: SCHEMA, fetch })).rejects.toThrow("didn't fit after 2 tries: answer.subject: missing");
  });

  it("says what Ollama said when it fails", async () => {
    const { fetch } = fakeOllama([], 404);
    await expect(ask({ prompt: "?", schema: SCHEMA, fetch })).rejects.toThrow("Ollama answered 404: model not found");
  });
});

describe("modelReady", () => {
  it("is true only with Ollama up and the model pulled", async () => {
    const { fetch } = fakeOllama([]);
    expect(await modelReady({ fetch })).toBe(true);
    expect(await modelReady({ fetch, model: "llama3" })).toBe(false);
    const down = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof globalThis.fetch;
    expect(await modelReady({ fetch: down })).toBe(false);
  });
});

describe("how long an answer may take", () => {
  it("leaves time to reach the token cap at 13 tokens a second, and never less than three minutes", () => {
    expect(timeoutFor(1024)).toBe(180_000);
    expect(timeoutFor(4096)).toBe(428_640);
    expect(timeoutFor(4096)).toBeGreaterThan(30_000 + (4096 / 13) * 1000);
  });
});
