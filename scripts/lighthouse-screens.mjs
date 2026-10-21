#!/usr/bin/env node
/**
 * Lighthouse on the five tabs, signed in. CI's Lighthouse job
 * sees only the landing page (lighthouserc.json); this builds the app
 * against the mock backend, serves the build, signs in with Playwright on
 * a Chrome with a debugging port, and runs Lighthouse (mobile, simulated
 * throttling) on each tab in that session. Median of three runs per
 * tab, against the same limits as CI's, except that console errors are
 * the mock's (it has no Realtime socket, and its study folder lacks some
 * of the objects the app asks for), so they're listed but don't fail it.
 * Local only: npm run perf:screens.
 */
import { spawn, execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";

const run = promisify(execFile);
const OUT = "dist-perf";
const APP = "http://localhost:4173";
const MOCK = "http://127.0.0.1:54321";
const PORT = 9333;
const RUNS = Number(process.env.LH_RUNS ?? 3);
const SCREENS = { Today: "/", Timetable: "/timetable", Attendance: "/attendance", Marks: "/marks", Study: "/study" };
const LIMITS = { performance: 0.88, lcp: 3500, tbt: 100, cls: 0.05 };
/** Audits that fail only because the backend is the mock. */
const MOCK_ONLY = new Set(["errors-in-console"]);

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    if (await fetch(url).then(() => true, () => false)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${url} didn't come up`);
}

/** One Lighthouse run on `url` in the signed-in browser. */
async function audit(url) {
  const file = path.join(tmpdir(), `acadkit-lh-${Date.now()}.json`);
  await run("npx", ["-y", "lighthouse@12.8.2", url, `--port=${PORT}`, "--disable-storage-reset", "--form-factor=mobile", "--only-categories=performance,accessibility,best-practices", "--output=json", `--output-path=${file}`, "--quiet"], { maxBuffer: 64 * 1024 * 1024 });
  const lhr = JSON.parse(await readFile(file, "utf8"));
  await rm(file, { force: true });
  // The audits that cost points in the scored categories other than speed, by title.
  const where = (audit) =>
    (audit.details?.items ?? [])
      .slice(0, 3)
      .map((i) => i.node?.snippet ?? (typeof i.value === "string" ? i.value : null) ?? i.description ?? i.source?.url ?? i.url)
      .filter(Boolean)
      .map((w) => String(w).slice(0, 140));
  const failing = ["accessibility", "best-practices"].flatMap((c) =>
    lhr.categories[c].auditRefs
      .filter((a) => a.weight > 0 && lhr.audits[a.id].score !== null && lhr.audits[a.id].score < 1)
      .map((a) => ({ id: a.id, text: [lhr.audits[a.id].title, ...where(lhr.audits[a.id]).map((w) => `    ${w}`)].join("\n") }))
  );
  return {
    failing,
    performance: lhr.categories.performance.score,
    accessibility: lhr.categories.accessibility.score,
    "best-practices": lhr.categories["best-practices"].score,
    lcp: lhr.audits["largest-contentful-paint"].numericValue,
    tbt: lhr.audits["total-blocking-time"].numericValue,
    cls: lhr.audits["cumulative-layout-shift"].numericValue,
  };
}

const env = { ...process.env, VITE_SUPABASE_URL: MOCK, VITE_SUPABASE_ANON_KEY: "mock-anon-key" };
await run("npx", ["vite", "build", "--outDir", OUT, "--emptyOutDir"], { env, maxBuffer: 64 * 1024 * 1024 });
const mock = spawn("node", ["scripts/dev-mock/server.mjs"], { env: { ...process.env, MOCK_NO_VITE: "1", STUDY_DIR: "e2e/study-fixture" }, stdio: "ignore" });
const preview = spawn("npx", ["vite", "preview", "--outDir", OUT, "--port", "4173", "--strictPort"], { stdio: "ignore" });
const profile = path.join(tmpdir(), `acadkit-lh-profile-${Date.now()}`);
let browser;
try {
  await Promise.all([waitFor(APP), waitFor(`${MOCK}/rest/v1/`)]);
  browser = await chromium.launchPersistentContext(profile, { headless: true, args: [`--remote-debugging-port=${PORT}`] });
  const page = browser.pages()[0] ?? (await browser.newPage());
  await page.goto(APP);
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await page.getByLabel("Email").fill("perf@acadkit.test");
  await page.getByLabel("Password").fill("perf-password");
  await page.locator("form").getByRole("button").click();
  await page.waitForSelector("main");

  const results = {};
  for (const [name, route] of Object.entries(SCREENS)) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await audit(`${APP}${route}`));
    const scores = Object.keys(runs[0]).filter((k) => k !== "failing");
    const failing = new Map(runs.flatMap((r) => r.failing).map((f) => [f.text, f]));
    results[name] = { ...Object.fromEntries(scores.map((k) => [k, median(runs.map((r) => r[k]))])), failing: [...failing.values()] };
  }

  let failed = false;
  const rows = Object.entries(results).map(([name, r]) => {
    const bad = [
      r.performance < LIMITS.performance && "performance",
      r.failing.some((f) => !MOCK_ONLY.has(f.id)) && "accessibility or best practices",
      r.lcp > LIMITS.lcp && "LCP",
      r.tbt > LIMITS.tbt && "TBT",
      r.cls > LIMITS.cls && "CLS",
    ].filter(Boolean);
    failed ||= bad.length > 0;
    return `${bad.length ? "✗" : "✓"} ${name.padEnd(7)} perf ${Math.round(r.performance * 100)}  a11y ${Math.round(r.accessibility * 100)}  bp ${Math.round(r["best-practices"] * 100)}  LCP ${Math.round(r.lcp)} ms  TBT ${Math.round(r.tbt)} ms  CLS ${r.cls.toFixed(3)}${bad.length ? `  (${bad.join(", ")})` : ""}`;
  });
  console.log(rows.join("\n"));
  const failing = [...new Set(Object.values(results).flatMap((r) => r.failing.map((f) => (MOCK_ONLY.has(f.id) ? `${f.text}\n    (the mock's, not counted)` : f.text))))];
  if (failing.length) console.log(`\nCosting points:\n${failing.map((t) => `  - ${t}`).join("\n")}`);
  await mkdir("lighthouse-report", { recursive: true });
  await writeFile("lighthouse-report/screens.json", JSON.stringify(results, null, 2));
  if (failed) process.exitCode = 1;
} finally {
  await browser?.close();
  mock.kill();
  preview.kill();
  await rm(profile, { recursive: true, force: true });
  await rm(OUT, { recursive: true, force: true });
}
