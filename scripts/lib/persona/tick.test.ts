import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { store as openStore } from "./store.mjs";
import { claudeBudget, runJob, tick } from "./tick.mjs";

let dir: string;
let store: ReturnType<typeof openStore>;
let clock: Date;
const now = () => clock;
const log = () => {};

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "persona-"));
  store = openStore(dir);
  clock = new Date(2026, 11, 1, 9);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const minutes = (n: number) => {
  clock = new Date(clock.getTime() + n * 60_000);
};

describe("a tick", () => {
  it("runs every due job side by side and records each", async () => {
    const order: string[] = [];
    const slow = { name: "slow", every: 10, run: async () => (await new Promise((r) => setTimeout(r, 30)), order.push("slow"), "12 messages") };
    const fast = { name: "fast", every: 10, run: async () => void order.push("fast") };
    const ran = await tick({ jobs: [slow, fast], store, now, notify: vi.fn(), log, env: {} });
    expect(Object.keys(ran).sort()).toEqual(["fast", "slow"]);
    expect(order).toEqual(["fast", "slow"]);
    expect(await store.read("slow")).toMatchObject({ ok: true, note: "12 messages", fails: 0 });
  });

  it("leaves a job alone until it's due again", async () => {
    const run = vi.fn(async () => {});
    const job = { name: "mail", every: 15, run };
    await tick({ jobs: [job], store, now, notify: vi.fn(), log, env: {} });
    minutes(14);
    await tick({ jobs: [job], store, now, notify: vi.fn(), log, env: {} });
    minutes(1);
    await tick({ jobs: [job], store, now, notify: vi.fn(), log, env: {} });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("skips a job another process is running", async () => {
    const run = vi.fn(async () => {});
    const held = await store.lock("mail");
    expect(await tick({ jobs: [{ name: "mail", every: 15, run }], store, now, notify: vi.fn(), log, env: {} })).toEqual({});
    expect(run).not.toHaveBeenCalled();
    await store.unlock(held!);
  });
});

describe("a failing job", () => {
  it("retries on its backoff, alerts once at the third failure, and says when it's fixed", async () => {
    let broken = true;
    const job = {
      name: "portal",
      every: 10,
      run: async () => {
        if (broken) throw new Error("portal down");
      },
    };
    const notify = vi.fn(async () => {});
    const go = () => tick({ jobs: [job], store, now, notify, log, env: {} });
    await go(); // fail 1, retry in 1 min
    minutes(1);
    await go(); // fail 2, retry in 2
    minutes(1);
    expect(await go()).toEqual({}); // not yet
    minutes(1);
    await go(); // fail 3: alert
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][1]).toBe("failing");
    expect(await store.read("portal")).toMatchObject({ fails: 3, note: "portal down" });
    broken = false;
    minutes(4);
    await go();
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify.mock.calls[1][1]).toBe("fixed");
  });

  it("is stopped at its time limit, and its signal aborts", async () => {
    let signal: AbortSignal | undefined;
    const job = {
      name: "hung",
      every: 10,
      timeoutMin: 0.001,
      run: (ctx: { signal: AbortSignal }) => {
        signal = ctx.signal;
        return new Promise(() => {});
      },
    };
    const rec = await runJob({ job, store, now, notify: vi.fn(), log, spendClaude: vi.fn() });
    expect(rec).toMatchObject({ ok: false, note: "stopped after 0.001 min" });
    expect(signal?.aborted).toBe(true);
    expect(await store.lock("hung")).not.toBeNull();
  });
});

describe("running one job by hand", () => {
  it("ignores its schedule", async () => {
    const run = vi.fn(async () => {});
    const job = { name: "semester", run };
    expect(await tick({ jobs: [job], store, now, notify: vi.fn(), log, env: {} })).toEqual({});
    const rec = await runJob({ job, store, now, notify: vi.fn(), log, spendClaude: vi.fn(), force: true });
    expect(rec).toMatchObject({ ok: true });
    expect(run).toHaveBeenCalledOnce();
  });
});

describe("the Claude budget", () => {
  it("lets jobs spend up to the day's cap and fails the one that goes over", async () => {
    const asks = (name: string, n: number) => ({ name, every: 10, run: async ({ spendClaude }: { spendClaude: (n: number) => Promise<void> }) => spendClaude(n) });
    const ran = await tick({ jobs: [asks("a", 2), asks("b", 2), asks("c", 1)], store, now, notify: vi.fn(), log, env: { PERSONA_CLAUDE_CAP: "3" } });
    const failed = Object.entries(ran).filter(([, r]) => !r.ok);
    expect(failed).toHaveLength(1);
    expect(failed[0][1].note).toMatch(/Claude cap reached for today/);
    expect(await store.readBudget()).toEqual({ day: "2026-12-01", used: 3 });
  });

  it("queues calls from one process so none are lost", async () => {
    const spendClaude = claudeBudget({ store, now, cap: 10 });
    await Promise.all([1, 2, 3, 4].map(() => spendClaude(1)));
    expect(await store.readBudget()).toEqual({ day: "2026-12-01", used: 4 });
  });
});
