import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// The navigation: the five tabs' bar on a phone, their sidebar on a Mac (src/lib/screens.ts).
const bar = (page: Page) => page.getByRole("navigation", { name: "Primary" }).last();
const lit = (page: Page) => bar(page).locator('[aria-current="page"]');

/** A finger dragged across the bar by `dx` pixels (the bar ignores a mouse). */
async function swipeBar(page: Page, dx: number) {
  await bar(page).evaluate((el, dx) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const at = (type: string, clientX: number) =>
      el.dispatchEvent(new PointerEvent(type, { pointerType: "touch", pointerId: 7, isPrimary: true, clientX, clientY: y, bubbles: true }));
    at("pointerdown", x);
    at("pointerup", x + dx);
  }, dx);
}

test.describe("on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "the phone's bar");

  test("swiping the bar walks the tabs in order, and stops at the ends", async ({ signedIn: page }) => {
    await expect(lit(page)).toHaveText("Today");
    await swipeBar(page, 120);
    await expect(lit(page)).toHaveText("Today");
    for (const [tab, url] of [["Timetable", "/timetable"], ["Attendance", "/attendance"], ["Marks", "/marks"], ["Study", "/study"]]) {
      await swipeBar(page, -120);
      await expect(page).toHaveURL(url);
      await expect(lit(page)).toHaveText(tab);
    }
    await swipeBar(page, -120);
    await expect(page).toHaveURL("/study");
    await swipeBar(page, 120);
    await expect(page).toHaveURL("/marks");
  });

  test("Back retraces the tabs you went through", async ({ signedIn: page }) => {
    await bar(page).getByRole("link", { name: "Attendance" }).click();
    await bar(page).getByRole("link", { name: "Marks" }).click();
    await page.getByRole("tab", { name: "Targets" }).click();
    await expect(page).toHaveURL("/marks");

    await page.goBack();
    await expect(page).toHaveURL("/attendance");
    await page.goBack();
    await expect(page).toHaveURL("/");
    await expect(lit(page)).toHaveText("Today");
  });

  test("the Run-up sits in the top bar, beside the name", async ({ signedIn: page }) => {
    const top = page.getByRole("banner");
    await expect(top.getByRole("link", { name: /^Run-up: / })).toBeVisible();
    await top.getByRole("link", { name: /^Run-up: / }).click();
    await expect(page).toHaveURL("/runup");
    await expect(lit(page)).toHaveCount(0);
  });

  test("the bar's labels fold away while you scroll down, and come back at the top", async ({ signedIn: page }) => {
    await page.goto("/attendance");
    await expect(page.getByRole("button", { name: /Operating Systems/ }).first()).toBeVisible();
    const label = bar(page).getByText("Attendance", { exact: true });
    await expect.poll(() => label.evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThan(5);
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, 150));
      await page.waitForTimeout(60);
    }
    await expect.poll(() => label.evaluate((e) => e.getBoundingClientRect().height)).toBeLessThan(1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => label.evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThan(5);
  });
});

test.describe("on a Mac", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

  test("the sidebar is the five tabs under the day order and the Run-up, with no bar at the bottom", async ({ signedIn: page }) => {
    const sidebar = bar(page);
    await expect(sidebar.getByRole("link")).toHaveText(["Today", "Timetable", "Attendance", "Marks", "Study"]);
    const aside = page.getByRole("complementary");
    await expect(aside.getByText(/^Day Order \d$/)).toBeVisible();
    await expect(aside.getByRole("link", { name: /^Run-up: / })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(1);
    await page.goto("/marks");
    await expect(lit(page)).toHaveText("Marks");
  });

  test("the keyboard moves through the sidebar and a page's views", async ({ signedIn: page, browserName }) => {
    // Safari moves Tab between links only with Option held (unless its setting says otherwise).
    const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
    await bar(page).getByRole("link", { name: "Today" }).focus();
    await page.keyboard.press(tab);
    await expect(bar(page).getByRole("link", { name: "Timetable" })).toBeFocused();
    await page.keyboard.press(tab);
    await page.keyboard.press(tab);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/marks");
    await expect(lit(page)).toHaveText("Marks");

    const targets = page.getByRole("tab", { name: "Targets" });
    await targets.focus();
    await page.keyboard.press("Enter");
    await expect(targets).toHaveAttribute("aria-selected", "true");
  });

  test("a file opens over Study and closes back onto it, the sidebar still saying Study", async ({ signedIn: page }) => {
    await page.goto(`/study?${new URLSearchParams({ dir: "Operating_Systems" })}`);
    await page.getByRole("link", { name: /Unit 2 scheduling notes/ }).first().click();
    await expect(page).toHaveURL(/\/view\?path=/);
    await expect(page.getByText("Process scheduling")).toBeVisible();
    await expect(lit(page)).toHaveText("Study");
    await page.getByRole("button", { name: "Back" }).first().click();
    await expect(page).toHaveURL(`/study?${new URLSearchParams({ dir: "Operating_Systems" })}`);
  });

  test("Settings' title and its groups share one column, and Today leaves the day order to the sidebar and the ball", async ({ signedIn: page }) => {
    await page.goto("/settings");
    const left = async (l: import("@playwright/test").Locator) => Math.round((await l.boundingBox())!.x);
    const title = page.getByRole("heading", { level: 1, name: "Settings" });
    const account = page.getByRole("heading", { level: 2, name: "Account" });
    await expect(account).toBeVisible();
    expect(Math.abs((await left(account)) - (await left(title)))).toBeLessThanOrEqual(8);

    await page.goto("/");
    await expect(page.getByRole("main").getByText(/Day Order \d/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Day Order 3\. More:/ })).toBeVisible();
  });
});
