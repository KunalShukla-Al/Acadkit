/**
 * Re-record the landing page's demo: `npm run demo:record`.
 *
 * Starts the mock backend (sample data only - nobody's real marks, and the
 * committed fixture as the study folder), signs in, walks the app in a
 * phone-sized browser (Today, Attendance, Marks and an explainer, the
 * ball opening onto the calendar and marking a class, the days you can
 * skip, Study), and stitches the screenshots into public/demo.webp, an
 * animated WebP (plays everywhere, a fraction of a GIF's size). Needs
 * img2webp: `brew install webp`. Then a still of each tab in light mode,
 * sharp at 2x, for the README (docs/screens/<tab>.webp).
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const APP = "http://localhost:5173";
const API = "http://127.0.0.1:54321";
const OUT = "public/demo.webp";
const STILLS = "docs/screens";
const SCREENS = [["today", "/"], ["timetable", "/timetable"], ["attendance", "/attendance"], ["marks", "/marks"], ["study", "/study"]];

const frames = mkdtempSync(path.join(tmpdir(), "acadkit-demo-"));
const shots = [];

const mock = spawn("npm", ["run", "dev:mock"], {
  env: { ...process.env, STUDY_DIR: "e2e/study-fixture" },
  stdio: "ignore",
  detached: true,
});
const stop = () => {
  try {
    process.kill(-mock.pid);
  } catch {
    /* already gone */
  }
};
process.on("exit", stop);

async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} never came up`);
}

try {
  await waitFor(APP);
  await waitFor(`${API}/rest/v1/settings`);
  // A neutral name on the greeting, for a public image.
  await fetch(`${API}/rest/v1/settings?device_id=eq.1234`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Asha" }),
  });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: "reduce",
    timezoneId: "Asia/Kolkata",
    serviceWorkers: "block",
  });
  // The Getting started card is for new accounts; in a demo it's noise.
  await page.addInitScript(() => localStorage.setItem("acadkit:getting-started-dismissed", "1"));
  // A Wednesday mid-morning, so a class is on right now.
  await page.clock.setFixedTime(new Date("2026-10-07T10:20:00+05:30"));

  const shot = async (ms) => {
    // The first app launch of the day plays the full splash; wait it out.
    // The app mounts after the page loads, so wait for its content with no splash over it.
    await page.waitForFunction(() => document.querySelector("main") && !document.querySelector("[data-launch-screen]"), undefined, { timeout: 10000 });
    // Toasts ("there goes a day off") would sit over the top of a frame.
    await page.locator("[data-sonner-toast]").first().waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(700);
    const file = path.join(frames, `${String(shots.length).padStart(2, "0")}.png`);
    await page.screenshot({ path: file });
    shots.push([ms, file]);
  };

  await page.goto(APP);
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await page.getByLabel("Email").fill("demo@acadkit.test");
  await page.getByLabel("Password").fill("demo-password");
  await page.locator("form").getByRole("button").click();
  await page.getByRole("heading", { name: /Wednesday, 7 October/ }).waitFor();
  // Today: the day's classes, then what's due.
  await shot(2800);
  await page.mouse.wheel(0, 600);
  await shot(1800);

  await page.goto(`${APP}/attendance`);
  await shot(2200);

  // Marks, and how its predicted SGPA was worked out (stills, with reduced motion).
  await page.goto(`${APP}/marks`);
  await shot(2000);
  await page.getByRole("button", { name: "Predicted SGPA: how it's worked out" }).first().click();
  await page.getByRole("dialog").getByRole("figure").waitFor();
  await shot(2600);
  await page.keyboard.press("Escape");

  // The ball, and marking a class from its calendar.
  await page.goto(`${APP}/`);
  await page.getByRole("button", { name: /More: calendar/ }).click();
  await page.getByRole("dialog", { name: "More" }).waitFor();
  await shot(2000);
  await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: /^calendar$/i }).click();
  await page.waitForURL(`${APP}/calendar`);
  await shot(1400);
  await page.getByRole("button", { name: /^7\s*D\d$/ }).click();
  await page.getByRole("button", { name: "Mark attendance for this day" }).click();
  await page.getByText(/Day Order \d - pick a mark/).waitFor();
  await shot(1400);
  await page.getByRole("button", { name: "Present - Operating Systems" }).click();
  await shot(2000);
  await page.keyboard.press("Escape");

  await page.goto(`${APP}/skips`);
  await shot(2400);

  await page.goto(`${APP}/study`);
  await shot(2200);

  // The stills: the same account, light, at 2x, one tab each.
  mkdirSync(STILLS, { recursive: true });
  const light = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light", reducedMotion: "reduce", timezoneId: "Asia/Kolkata", serviceWorkers: "block", storageState: await page.context().storageState() });
  const still = await light.newPage();
  await still.clock.setFixedTime(new Date("2026-10-07T10:20:00+05:30"));
  for (const [name, at] of SCREENS) {
    await still.goto(`${APP}${at}`);
    await still.waitForFunction(() => document.querySelector("main") && !document.querySelector("[data-launch-screen]"), undefined, { timeout: 10000 });
    await still.locator("[data-sonner-toast]").first().waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
    await still.waitForTimeout(700);
    await sharp(await still.screenshot()).webp({ quality: 80 }).toFile(path.join(STILLS, `${name}.webp`));
  }
  console.log(`${STILLS}: ${SCREENS.length} stills`);

  await browser.close();

  const args = ["-loop", "0", "-lossy", "-q", "75", "-m", "6"];
  for (const [ms, file] of shots) args.push("-d", String(ms), file);
  execFileSync("img2webp", [...args, "-o", OUT], { stdio: "ignore" });
  console.log(`${OUT}: ${shots.length} frames, ${(statSync(OUT).size / 1024).toFixed(0)} KB`);
} finally {
  stop();
  rmSync(frames, { recursive: true, force: true });
}
process.exit(0);
