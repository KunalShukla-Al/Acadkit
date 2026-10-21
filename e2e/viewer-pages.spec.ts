import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// e2e/study-fixture: a 6-page PDF, one "Page n" heading per page.
const PDF = "Operating_Systems/Unit 3 deadlocks (6 pages).pdf";

const counter = (page: Page) => page.getByRole("button", { name: /^Page \d+ of 6\./ });

/** The PDF, open, with the launch splash gone from over it. */
async function open(page: Page) {
  await page.goto(`/view?path=${encodeURIComponent(PDF)}`);
  await page.waitForFunction(() => !document.querySelector("[data-launch-screen]"));
  await expect(counter(page)).toBeVisible();
}

test("the pill counts the pages and follows the scroll", async ({ signedIn: page }) => {
  await open(page);
  await expect(counter(page)).toHaveAccessibleName(/^Page 1 of 6\./);
  // To the very end: the last page.
  await page.locator('[id="pdf-page-6"]').scrollIntoViewIfNeeded();
  await expect(counter(page)).toHaveAccessibleName(/^Page 6 of 6\./);
});

test("tapping the count lets you type a page to go to", async ({ signedIn: page }) => {
  await open(page);
  await counter(page).click();
  const field = page.getByRole("textbox", { name: "Go to page, 1 to 6" });
  await expect(field).toBeFocused();
  await field.fill("4");
  await field.press("Enter");
  await expect(counter(page)).toHaveAccessibleName(/^Page 4 of 6\./);
  // Page 4's top is at the top of the screen.
  const top = await page.locator('[id="pdf-page-4"]').evaluate((el) => el.getBoundingClientRect().top);
  const header = await page.locator("header").evaluate((el) => el.getBoundingClientRect().bottom);
  expect(Math.abs(top - header)).toBeLessThan(40);
});

test("dragging sideways on the count flips through the file", async ({ signedIn: page }) => {
  await open(page);
  await expect(counter(page)).toHaveAccessibleName(/^Page 1 of 6\./);
  // A raw mouse press doesn't wait for anything (the launch splash can still arrive over the
  // page on a slow runner); a trial click waits until the counter is what a press would hit.
  await counter(page).click({ trial: true });
  const box = (await counter(page).boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  // 28 px a page in a short file: three pages on.
  for (let dx = 10; dx <= 90; dx += 10) await page.mouse.move(box.x + box.width / 2 + dx, y);
  // The page you'd land on floats above the pill while you drag.
  await expect(page.getByText("of 6", { exact: true })).toBeVisible();
  await page.mouse.up();
  await expect(counter(page)).toHaveAccessibleName(/^Page 4 of 6\./);
  await expect(page.getByText("of 6", { exact: true })).toBeHidden();
  // A scrub, not a selection.
  expect(await page.evaluate(() => String(getSelection()))).toBe("");
});
