import type { Page } from "@playwright/test";
import { expect, MOCK_API, test } from "./fixtures";

// Tomorrow offline (src/lib/tomorrow.ts): in the evening the next class day's files go into the file cache.
const STORAGE = MOCK_API.replace("/rest/v1", "/storage/v1/object/study-files/1234");
const NOTES = "Operating_Systems/Unit 2 scheduling notes.pdf";
const DEADLOCKS = "Operating_Systems/Unit 3 deadlocks (6 pages).pdf";
const EVENING = new Date("2026-10-07T19:00:00+05:30");

/** The sync's manifest with OS's files tagged by course, and a test tomorrow whose prep names one file. */
async function seed(page: Page) {
  const manifest = await (await page.request.get(`${STORAGE}/manifest.json`)).json();
  for (const f of manifest.files) if (f.path.startsWith("Operating_Systems/")) f.subject_code = "21CSC202J";
  await page.request.post(`${STORAGE}/manifest.json`, { data: manifest });
  await page.request.post(`${STORAGE}/prep.json`, {
    data: { version: 1, generatedAt: 1, tests: [{ subject_code: "21CSC202J", due_date: "2026-10-08T09:00:00+05:30", title: "OS CT-2", topics: [], files: [{ path: DEADLOCKS }] }] },
  });
  return manifest.files as { path: string; key: string }[];
}

const kept = (page: Page) =>
  page.evaluate(async () => {
    const keys = await (await caches.open("acadkit-files-v1")).keys();
    return keys.map((r) => decodeURIComponent(new URL(r.url).pathname.replace("/__study-file/", "")));
  });

test("in the evening the next class day's files go onto the device, the test's first", async ({ signedIn: page }) => {
  const files = await seed(page);
  const key = (p: string) => files.find((f) => f.path === p)!.key;
  await page.clock.setFixedTime(EVENING);
  await page.reload();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("acadkit:tomorrow") ?? "null")), { timeout: 15_000 }).toMatchObject({ date: "2026-10-08", files: 2, ready: 2 });
  expect((await kept(page)).sort()).toEqual([key(DEADLOCKS), key(NOTES)].sort());
});

test("not before the evening, and not once it's turned off", async ({ signedIn: page }) => {
  await seed(page);
  await page.reload();
  await page.waitForTimeout(1500);
  expect(await kept(page)).toEqual([]);

  await page.goto("/settings");
  await page.getByRole("switch", { name: "Tomorrow offline" }).click();
  await page.clock.setFixedTime(EVENING);
  await page.reload();
  await page.waitForTimeout(1500);
  expect(await kept(page)).toEqual([]);
});

test("Settings says so once they're on the device, and the next morning says it's today's", async ({ signedIn: page }) => {
  await seed(page);
  await page.goto("/settings");
  await expect(page.getByText(/files are on this device/)).toHaveCount(0);
  await page.clock.setFixedTime(EVENING);
  await page.reload();
  // The run finishes after the page has drawn; the hint changes when it does.
  await expect(page.getByText(/^Tomorrow's files are on this device · 2 files, [\d.]+ (KB|MB)$/)).toBeVisible({ timeout: 15_000 });

  await page.clock.setFixedTime(new Date("2026-10-08T07:30:00+05:30"));
  await page.reload();
  await expect(page.getByText(/^Today's files are on this device/)).toBeVisible();
});
