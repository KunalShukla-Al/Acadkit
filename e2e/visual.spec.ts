import { expect, test, waitForLaunch } from "./fixtures";

/**
 * The design catalog (/design) and the five tabs and the corner in the
 * brutalist theme, light and dark, on a phone and on a Mac-sized screen, against the
 * pictures in visual.spec.ts-snapshots. A change to a token, a primitive
 * or a screen shows up here as a diff; npm run test:visual --
 * --update-snapshots takes new ones.
 *
 * The pictures are this Mac's rendering. Linux draws text differently, so
 * CI skips these.
 */
test.skip(!!process.env.CI, "the baselines are macOS rendering");

const SCREENS = [
  { device: "phone", use: {} },
  { device: "mac", use: { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 2 } },
] as const;

for (const { device, use } of SCREENS) {
  test.describe(`on a ${device}`, () => {
    test.use(use);
    for (const mode of ["light", "dark"] as const) {
      test(`the catalog, ${mode}`, async ({ signedIn: page }) => {
        await page.evaluate((m) => {
          localStorage.setItem("acadkit:theme-mode", m);
        }, mode);
        await page.goto("/design");
        await waitForLaunch(page);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator("html")).toHaveAttribute("data-theme", "brutalist");
        await expect(page).toHaveScreenshot(`design-${device}-${mode}.png`, { fullPage: true, maxDiffPixelRatio: 0.002 });
      });
    }
  });
}

/** Each tab's first view, and the Run-up and Settings, at 1x so the pictures stay small. */
const FIVE = [
  { name: "today", path: "/" },
  { name: "timetable", path: "/timetable" },
  { name: "attendance", path: "/attendance" },
  { name: "marks", path: "/marks" },
  { name: "study", path: "/study" },
  { name: "runup", path: "/runup" },
  { name: "settings", path: "/settings" },
];

for (const { device, use } of SCREENS) {
  test.describe(`the pages on a ${device}`, () => {
    test.use({ ...use, deviceScaleFactor: 1 });
    for (const mode of ["light", "dark"] as const) {
      for (const { name, path } of FIVE) {
        test(`${name}, ${mode}`, async ({ signedIn: page }) => {
          // The account's mode is "system" once signed in, so the system's scheme decides.
          await page.emulateMedia({ colorScheme: mode });
          await page.goto(path);
          await waitForLaunch(page);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(500);
          // When the mock's study folder was read, and the build's commit: they change from run to run.
          const mask = [page.getByText(/· synced \d/), page.getByText(/^AcadKit \d+\.\d+\.\d+ · /)];
          await expect(page).toHaveScreenshot(`screen-${name}-${device}-${mode}.png`, { mask, maxDiffPixelRatio: 0.002 });
        });
      }
    }
  });
}

for (const { device, use } of SCREENS) {
  test.describe(`the corner on a ${device}`, () => {
    test.use({ ...use, deviceScaleFactor: 1 });
    test("open, dark", async ({ signedIn: page }) => {
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await waitForLaunch(page);
      await page.getByRole("button", { name: /More: calendar/ }).click();
      await expect(page.getByRole("dialog", { name: "More" })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(800);
      await expect(page).toHaveScreenshot(`corner-${device}.png`, { maxDiffPixelRatio: 0.002 });
    });
  });
}
