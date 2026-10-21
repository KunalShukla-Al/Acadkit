import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, MOCK_API, openSignIn, test, waitForLaunch } from "./fixtures";

/**
 * axe on every screen, in light and dark: WCAG 2.1 A and AA. A serious or
 * critical violation fails the run; minor ones are left to judgement.
 */
/** The five tabs (src/lib/screens.ts), what the ball and the top bar open, and the pages opened from inside them. */
const PAGES = [
  "/", "/timetable", "/attendance", "/marks", "/study", "/runup", "/deadlines", "/calendar", "/skips", "/settings", "/history",
  "/runup/2026-10-08", "/runup/event/os-ft2", "/log", "/wrapped", "/electives",
];

async function audit(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n    ")}`);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} mode`, () => {
    // Reduced motion: the app then skips its entrance animations (MotionConfig
    // reducedMotion="user"), so axe never reads a colour mid-fade. A fixed
    // wait wasn't enough - Marks' SGPA dial failed about one run in five.
    test.use({ colorScheme: scheme, reducedMotion: "reduce" });

    test("the landing page", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForTimeout(500);
      expect(await audit(page)).toEqual([]);
    });

    test("the sign-in screen", async ({ page }) => {
      await openSignIn(page);
      // It fades in: axe reads colours mid-fade as low contrast.
      await page.waitForTimeout(1200);
      expect(await audit(page)).toEqual([]);
    });

    test("onboarding", async ({ page }) => {
      await openSignIn(page);
      await page.getByLabel("Email").fill("new-student@acadkit.test");
      await page.getByLabel("Password").fill("e2e-password");
      await page.locator("form").getByRole("button").click();
      await expect(page.getByText("Step 1 of 2")).toBeVisible();
      await page.waitForTimeout(1200);
      expect(await audit(page)).toEqual([]);

      await page.getByRole("button", { name: "Next" }).click();
      await page.getByRole("radio", { name: /CSE \(Data Science\)/ }).click();
      await page.waitForTimeout(1200);
      expect(await audit(page)).toEqual([]);
    });

    for (const path of PAGES) {
      // Nothing plays in, so there's no fade to wait out.
      test(`${path}`, async ({ signedIn: page }) => {
        if (path !== "/") await page.goto(path);
        await waitForLaunch(page);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.waitForTimeout(300);
        expect(await audit(page)).toEqual([]);
      });
    }

    test("a day half over: classes already had, on Today and the Timetable", async ({ signedIn: page }) => {
      await page.clock.setFixedTime(new Date("2026-10-07T12:20:00+05:30"));
      for (const path of ["/", "/timetable"]) {
        await page.goto(path);
        await waitForLaunch(page);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.waitForTimeout(300);
        expect(await audit(page), path).toEqual([]);
      }
    });

    test("the ball, open", async ({ signedIn: page }) => {
      await waitForLaunch(page);
      await page.getByRole("button", { name: /More: calendar/ }).click();
      await expect(page.getByRole("dialog", { name: "More" })).toBeVisible();
      await page.waitForTimeout(800);
      expect(await audit(page)).toEqual([]);
    });

    test("the lines that come and go, and an explainer: Continue, Tomorrow offline, how a number is worked out", async ({ signedIn: page, isMobile }) => {
      await page.request.post(`${MOCK_API}/reading_now`, {
        data: { device_id: "1234", path: "Operating_Systems/Unit 2 scheduling notes.pdf", page: 3, kind: isMobile ? "computer" : "phone", updated_at: "2026-10-07T01:55:00Z" },
      });
      await page.evaluate(() => localStorage.setItem("acadkit:tomorrow", JSON.stringify({ date: "2026-10-07", files: 4, ready: 4, bytes: 18e6, at: 1 })));
      await page.reload();
      await expect(page.getByRole("link", { name: /^Continue / })).toBeVisible();
      expect(await audit(page)).toEqual([]);

      await page.goto("/settings");
      await expect(page.getByText(/^Today's files are on this device/)).toBeVisible();
      expect(await audit(page)).toEqual([]);

      await page.goto("/marks");
      await page.getByRole("button", { name: "Predicted SGPA: how it's worked out" }).click();
      await expect(page.getByRole("dialog").getByRole("figure")).toBeVisible();
      await page.waitForTimeout(800);
      expect(await audit(page)).toEqual([]);
    });
  });
}
