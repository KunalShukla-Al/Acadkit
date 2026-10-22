import { describe, expect, it, vi } from "vitest";
import {
  dispatchConfig,
  dispatchDeliver,
  dispatchRequest,
  needsDueCount,
  shouldDispatch,
  type DispatchConfig,
} from "./dispatch.ts";

const TOKEN = "github_pat_TESTONLY_abc123";
const CFG: DispatchConfig = { token: TOKEN, repo: "KunalShukla-Al/jobq", workflow: "deliver.yml", ref: "main" };

const envOf = (vars: Record<string, string>) => (name: string) => vars[name];

describe("dispatchConfig", () => {
  it("is null without a token, so nothing is started", () => {
    expect(dispatchConfig(envOf({}))).toBeNull();
    expect(dispatchConfig(envOf({ GITHUB_DISPATCH_TOKEN: "" }))).toBeNull();
    expect(dispatchConfig(envOf({ GITHUB_DISPATCH_TOKEN: "  \n" }))).toBeNull();
    expect(dispatchConfig(envOf({ GITHUB_DISPATCH_REPO: "someone/else" }))).toBeNull();
  });

  it("defaults to jobq's Deliver on main", () => {
    expect(dispatchConfig(envOf({ GITHUB_DISPATCH_TOKEN: ` ${TOKEN}\n` }))).toEqual(CFG);
  });

  it("takes another repo and workflow when given", () => {
    expect(
      dispatchConfig(
        envOf({ GITHUB_DISPATCH_TOKEN: TOKEN, GITHUB_DISPATCH_REPO: "me/fork", GITHUB_DISPATCH_WORKFLOW: "drain.yml" })
      )
    ).toEqual({ token: TOKEN, repo: "me/fork", workflow: "drain.yml", ref: "main" });
  });
});

describe("shouldDispatch", () => {
  it("never starts Deliver with jobq off", () => {
    expect(shouldDispatch("off", 0)).toBe(false);
    expect(shouldDispatch("off", 5)).toBe(false);
    expect(shouldDispatch("off", 5, 3)).toBe(false);
  });

  it("starts it when this run queued something new", () => {
    expect(shouldDispatch("shadow", 1)).toBe(true);
    expect(shouldDispatch("on", 2)).toBe(true);
    expect(shouldDispatch("on", 2, 0)).toBe(true);
  });

  it("with nothing new, starts it only when on and jobs are due", () => {
    expect(shouldDispatch("on", 0)).toBe(false);
    expect(shouldDispatch("on", 0, 0)).toBe(false);
    expect(shouldDispatch("on", 0, 1)).toBe(true);
    // Shadow jobs do nothing: no need to run for leftovers.
    expect(shouldDispatch("shadow", 0, 4)).toBe(false);
  });
});

describe("needsDueCount", () => {
  it("asks the database only when on and nothing new was queued", () => {
    expect(needsDueCount("on", 0)).toBe(true);
    expect(needsDueCount("on", 1)).toBe(false);
    expect(needsDueCount("shadow", 0)).toBe(false);
    expect(needsDueCount("off", 0)).toBe(false);
  });
});

describe("dispatchRequest", () => {
  it("is GitHub's workflow_dispatch call for main", () => {
    const { url, init } = dispatchRequest(CFG);
    expect(url).toBe("https://api.github.com/repos/KunalShukla-Al/jobq/actions/workflows/deliver.yml/dispatches");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"ref":"main"}');
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "acadkit-send-reminders",
    });
  });
});

describe("dispatchDeliver", () => {
  it("is dispatched on GitHub's 204", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(dispatchDeliver(CFG, fetchFn as typeof fetch)).resolves.toEqual({ dispatched: true });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(dispatchRequest(CFG).url);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("counts any 2xx as dispatched, not only 204", async () => {
    const fetchFn = async () => new Response(JSON.stringify({ workflow_run_id: 1 }), { status: 200 });
    await expect(dispatchDeliver(CFG, fetchFn as typeof fetch)).resolves.toEqual({ dispatched: true });
  });

  it("reports GitHub's message on a refusal", async () => {
    const fetchFn = async () =>
      new Response(JSON.stringify({ message: "Bad credentials", status: "401" }), { status: 401 });
    await expect(dispatchDeliver(CFG, fetchFn as typeof fetch)).resolves.toEqual({
      dispatched: false,
      error: "GitHub 401: Bad credentials",
    });
  });

  it("reports a body that isn't JSON, cut short", async () => {
    const fetchFn = async () => new Response("x".repeat(500), { status: 502 });
    const result = await dispatchDeliver(CFG, fetchFn as typeof fetch);
    expect(result).toEqual({ dispatched: false, error: `GitHub 502: ${"x".repeat(200)}` });
  });

  it("reports a network failure instead of throwing", async () => {
    const fetchFn = async () => {
      throw new TypeError("error sending request");
    };
    await expect(dispatchDeliver(CFG, fetchFn as typeof fetch)).resolves.toEqual({
      dispatched: false,
      error: "error sending request",
    });
  });

  it("gives up after the timeout", async () => {
    const fetchFn = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    await expect(dispatchDeliver(CFG, fetchFn as unknown as typeof fetch, 10)).resolves.toEqual({
      dispatched: false,
      error: "no answer from GitHub in 10 ms",
    });
  });

  it("never puts the token in an error", async () => {
    const echo = async () => new Response(JSON.stringify({ message: `bad token ${TOKEN}` }), { status: 403 });
    const thrown = async () => {
      throw new Error(`failed with Authorization: Bearer ${TOKEN}`);
    };
    for (const fetchFn of [echo, thrown]) {
      const result = await dispatchDeliver(CFG, fetchFn as typeof fetch);
      expect(result.dispatched).toBe(false);
      expect(JSON.stringify(result)).not.toContain(TOKEN);
    }
  });
});
