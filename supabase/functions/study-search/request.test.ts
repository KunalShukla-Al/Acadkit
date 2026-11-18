import { describe, expect, it } from "vitest";
import { MAX_BODY_BYTES, ownsPin, readSearchRequest } from "./request.ts";

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request("https://fn.test/study-search", { method: "POST", body, headers });

describe("readSearchRequest", () => {
  it("reads a normal search", async () => {
    expect(await readSearchRequest(post(JSON.stringify({ query: " deadlock ", device_id: "1111" })))).toEqual({
      query: "deadlock",
      pin: "1111",
      limit: 12,
    });
  });

  it("clamps the result count", async () => {
    const r = await readSearchRequest(post(JSON.stringify({ query: "x", device_id: "1111", limit: 999 })));
    expect(r).toMatchObject({ limit: 30 });
  });

  it("refuses a body over the cap by its header", async () => {
    const r = await readSearchRequest(post("{}", { "Content-Length": String(MAX_BODY_BYTES + 1) }));
    expect(r).toEqual({ error: "request too large", status: 413 });
  });

  it("refuses a body over the cap even when the header understates it", async () => {
    const big = JSON.stringify({ query: "x".repeat(MAX_BODY_BYTES), device_id: "1111" });
    const r = await readSearchRequest(post(big, { "Content-Length": "10" }));
    expect(r).toEqual({ error: "request too large", status: 413 });
  });

  it("refuses bad JSON, an empty query and a malformed PIN", async () => {
    expect(await readSearchRequest(post("not json"))).toMatchObject({ status: 400 });
    expect(await readSearchRequest(post("null"))).toMatchObject({ status: 400 });
    expect(await readSearchRequest(post(JSON.stringify({ query: "  ", device_id: "1111" })))).toMatchObject({ error: "empty query" });
    expect(await readSearchRequest(post(JSON.stringify({ query: "x", device_id: "12" })))).toMatchObject({
      error: "device_id must be 4 digits",
    });
  });
});

describe("ownsPin", () => {
  const lookup = (result: { data: unknown; error: unknown } | Error) => async () => {
    if (result instanceof Error) throw result;
    return result;
  };

  it("is true only when the caller's own row comes back", async () => {
    expect(await ownsPin(lookup({ data: [{ device_id: "1111" }], error: null }), "1111")).toBe(true);
    expect(await ownsPin(lookup({ data: [], error: null }), "2222")).toBe(false);
  });

  it("is false when the lookup fails", async () => {
    expect(await ownsPin(lookup({ data: null, error: { message: "permission denied" } }), "1111")).toBe(false);
    expect(await ownsPin(lookup(new Error("network")), "1111")).toBe(false);
  });
});
