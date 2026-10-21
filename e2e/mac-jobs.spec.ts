import type { Page } from "@playwright/test";
import { expect, MOCK_API, test } from "./fixtures";

// The Mac line at the foot of Study (scripts/lib/jobs.mjs writes <pin>/jobs.json).
const STORAGE = MOCK_API.replace("/rest/v1", "/storage/v1/object/study-files/1234");
const NOW = Date.parse("2026-10-07T07:30:00+05:30");
const MIN = 60_000;

const seed = (page: Page, jobs: Record<string, unknown>) => page.request.post(`${STORAGE}/jobs.json`, { data: { version: 1, jobs } });

test("Study ends on how the Mac's jobs went, and opens when each last ran", async ({ signedIn: page }) => {
  await seed(page, {
    sync: { at: NOW - 4 * MIN, ok: true, note: "412 files" },
    autopilot: { at: NOW - 70 * MIN, ok: true, note: "paused" },
    night: { at: NOW - 5 * 60 * MIN, ok: true, note: "Filed 2 photos; transcribed 1 lecture." },
  });
  await page.goto("/study");
  const line = page.getByRole("button", { name: /^Your Mac is keeping up\s*synced \d+ min ago$/ });
  await expect(line).toBeVisible();
  await line.click();
  const sheet = page.getByRole("dialog", { name: "Your Mac" });
  await expect(sheet.getByRole("listitem")).toHaveText([/^Study folder sync412 files\d+ min ago$/, /^Autopilotpaused1 h ago$/, /^Class recordernot yet$/, /^Night shiftFiled 2 photos; transcribed 1 lecture\.5 h ago$/]);
});

test("a job that failed comes first, in red", async ({ signedIn: page }) => {
  await seed(page, { sync: { at: NOW - 4 * MIN, ok: true }, recorder: { at: NOW - 20 * MIN, ok: false, note: "whisper-cli is missing" } });
  await page.goto("/study");
  await expect(page.getByRole("button", { name: /^Class recorder failed on your Mac\s*\d+ min ago$/ })).toBeVisible();
});

test("nothing until the Mac has said something", async ({ signedIn: page }) => {
  await page.goto("/study");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/your Mac|Your Mac/)).toHaveCount(0);
});
