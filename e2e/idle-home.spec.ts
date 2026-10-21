import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** The app going to the background and coming back `ms` later. */
async function awayFor(page: Page, ms: number) {
  const setState = (state: "hidden" | "visible") =>
    page.evaluate((s) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => s });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);
  await setState("hidden");
  await page.clock.fastForward(ms);
  await setState("visible");
}

test("coming back after two and a half minutes away opens Today", async ({ signedIn: page }) => {
  await page.clock.install();
  await page.goto("/marks");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await awayFor(page, 60_000);
  await expect(page).toHaveURL(/\/marks$/); // a short trip away keeps your place

  await awayFor(page, 151_000);
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/marks$/); // and where you were is one Back away
});
