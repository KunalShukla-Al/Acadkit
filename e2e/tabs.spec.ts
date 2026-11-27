import type { Page } from "@playwright/test";
import { expect, MOCK_API, test, waitForLaunch } from "./fixtures";

// The five tabs (src/lib/screens.ts), the Desk in the top bar and the corner (src/components/layout).
const bar = (page: Page) => page.getByRole("navigation", { name: "Primary" }).last();
const corner = (page: Page) => page.getByRole("button", { name: /Calendar\. Hold for/ });

test("the bar is the five tabs, each lit for its pages, and the corner's and the Desk's light none", async ({ signedIn: page }) => {
  await expect(bar(page).getByRole("link")).toHaveText(["Today", "Timetable", "Attendance", "Marks", "Study"]);
  const lit = bar(page).locator('[aria-current="page"]');
  await expect(lit).toHaveText("Today");

  await bar(page).getByRole("link", { name: "Attendance" }).click();
  await expect(page).toHaveURL("/attendance");
  await expect(lit).toHaveText("Attendance");

  for (const [path, tab] of [["/log", "Attendance"], ["/deadlines", "Today"], ["/subject/21CSC202J", "Study"]]) {
    await page.goto(path);
    await expect(lit, path).toHaveText(tab);
  }
  for (const path of ["/desk", "/desk/practice", "/calendar", "/skips", "/settings", "/history"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(lit, path).toHaveCount(0);
  }
});

test("Today is the day's classes and what's due, and nothing else unless it needs you", async ({ signedIn: page }) => {
  await expect(page.getByRole("heading", { name: /Wednesday, 7 October/ })).toBeVisible();
  const main = page.getByRole("main");
  for (const gone of [/Day Order \d/, /predicted sgpa/i, /attended/]) await expect(main.getByText(gone)).toHaveCount(0);

  await main.getByRole("link", { name: /^Deadlines\s*All/i }).click();
  await expect(page).toHaveURL("/deadlines");
  await expect(page.getByRole("heading", { level: 1, name: "Deadlines" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Upcoming deadlines/ })).toBeVisible();
});

test("Today puts the next thing that carries marks on top, and only one", async ({ signedIn: page }) => {
  // The seeded lab record and unit test carry no marks, so nothing shows yet.
  await expect(page.getByText(/· out of \d+/)).toHaveCount(0);
  for (const [id, title, due, max] of [["a1", "Assignment 3", "2026-10-09", 10], ["f3", "FT-III", "2026-10-12", 15]] as const) {
    await page.request.post(`${MOCK_API}/deadlines`, {
      data: { id: `00000000-0000-4000-8000-0000000000${id}`, device_id: "1234", subject_id: null, title, type: id === "a1" ? "assignment" : "exam", due_date: `${due}T09:00:00+05:30`, status: "pending", priority: "high", max_marks: max },
    });
  }
  await page.reload();
  await waitForLaunch(page);
  const card = page.getByRole("main").locator("section", { hasText: "· out of" });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Assignment 3");
  await expect(card).toContainText("· out of 10");
  await expect(card).toContainText("2 days");
});

test("Attendance and Marks are tabs of their own, each with its number", async ({ signedIn: page }) => {
  await page.goto("/attendance");
  await expect(page.getByRole("heading", { level: 1, name: "Attendance" })).toBeVisible();
  await expect(page.getByText("overall", { exact: true })).toHaveCount(1);
  await expect(page.getByText(/^\d+ attended · \d+ missed/)).toBeVisible();
  const clipped = () =>
    page.locator('nav[aria-label="Jump to a subject"] .truncate').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent));
  expect(await clipped()).toEqual([]);

  await page.goto("/marks");
  await expect(page.getByRole("heading", { level: 1, name: "Marks" })).toBeVisible();
  await expect(page.getByText(/^Predicted from \d+ subjects/)).toBeVisible();
  await expect(page.getByText(/^predicted sgpa$/i)).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "Targets" })).toBeVisible();
});

test("Study is the study folder: files, search, and the viewer closes back onto it", async ({ signedIn: page }) => {
  await bar(page).getByRole("link", { name: "Study" }).click();
  await expect(page).toHaveURL("/study");
  await expect(page.getByRole("heading", { level: 1, name: "Study" })).toBeVisible();

  const search = page.getByRole("textbox", { name: "Search files" });
  await search.fill("scheduling notes");
  await expect(page.getByRole("link", { name: /Unit 2 scheduling notes/ }).first()).toBeVisible();

  // A file opened from a link, with nothing behind it: Back lands on its folder, on Study.
  await page.goto(`/view?${new URLSearchParams({ path: "Operating_Systems/Unit 2 scheduling notes.pdf" })}`);
  await page.getByRole("button", { name: "Back" }).first().click();
  await expect(page).toHaveURL(`/study?${new URLSearchParams({ dir: "Operating_Systems" })}`);
  await expect(bar(page).locator('[aria-current="page"]')).toHaveText("Study");
});

test("the Desk is one tap away from any page, with the day's count", async ({ signedIn: page }) => {
  await page.goto("/marks");
  const desk = page.getByRole("link", { name: /^Desk \d+\/\d+ targets done$/ });
  await expect(desk).toBeVisible();
  await desk.click();
  await expect(page).toHaveURL("/desk");
  await expect(page.getByRole("heading", { level: 1, name: /Wednesday, 7 October/ })).toBeVisible();
  await expect(desk).toHaveAttribute("aria-current", "page");
});

test("the corner carries the day order and opens the calendar in one tap", async ({ signedIn: page }) => {
  await expect(corner(page)).toHaveAccessibleName(/^Day Order 3\. Calendar/);
  await corner(page).click();
  await expect(page).toHaveURL("/calendar");
  await expect(page.getByRole("dialog", { name: "More" })).toHaveCount(0);
});

test("holding the corner opens the pages used now and then, and the phone's top bar has no More of its own", async ({ signedIn: page }) => {
  await expect(page.getByRole("banner").getByRole("button", { name: /^More: / })).toHaveCount(0);

  // A right-click is what a held finger sends.
  await corner(page).click({ button: "right" });
  const menu = page.getByRole("dialog", { name: "More" });
  await expect(menu.getByRole("button", { name: "Close" })).toBeFocused();
  await expect(menu.getByRole("button").filter({ hasText: /\w/ })).toHaveText([/skips/i, /history/i, /settings/i]);

  await menu.getByRole("button", { name: /^settings$/i }).click();
  await expect(page).toHaveURL("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

  await corner(page).click({ button: "right" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "More" })).toHaveCount(0);

  // Held, the corner opens the menu and the press doesn't also open the calendar.
  await corner(page).hover();
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "More" })).toBeVisible();
  await expect(page).toHaveURL("/settings");
});

test("the corner floats in the bottom-right, as far from the edge as from the tab bar where there is one", async ({ signedIn: page, isMobile }) => {
  const box = (await corner(page).boundingBox())!;
  const { width, height } = page.viewportSize()!;
  const floor = isMobile ? (await bar(page).boundingBox())!.y : height;
  const fromEdge = Math.round(width - (box.x + box.width));
  const fromFloor = Math.round(floor - (box.y + box.height));
  expect(fromEdge).toBeGreaterThan(0);
  expect(fromFloor).toBe(fromEdge);
});

test("old links (notifications, bookmarks, the Shortcuts) land on the page they meant", async ({ signedIn: page }) => {
  const lands = [
    ["/grades", "/attendance"],
    ["/grades?show=marks", "/marks"],
    ["/grades?show=skips", "/skips"],
    ["/survival", "/skips"],
    ["/plan", "/calendar"],
    ["/plan?show=runup", "/desk"],
    ["/runup", "/desk"],
    ["/plan?show=timetable", "/timetable"],
    ["/plan?show=deadlines", "/deadlines"],
    ["/you", "/settings"],
    ["/you?show=history", "/history"],
  ];
  for (const [from, to] of lands) {
    await page.goto(from);
    await expect(page, from).toHaveURL(to);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  await page.goto(`/files?${new URLSearchParams({ dir: "Operating_Systems" })}`);
  await expect(page).toHaveURL(`/study?${new URLSearchParams({ dir: "Operating_Systems" })}`);
  // A Run-up day lands on the same day of the Desk; a subject stays where it is.
  await page.goto("/runup/2026-10-08");
  await expect(page).toHaveURL("/desk/2026-10-08");
  await expect(page.getByRole("heading", { name: /Thursday, 8 October/ })).toBeVisible();
  await page.goto("/runup/event/os-ft2");
  await expect(page).toHaveURL("/desk/event/os-ft2");
  await page.goto("/subject/21CSC202J");
  await expect(page).toHaveURL("/subject/21CSC202J");
});

/**
 * Motion's animations (not CSS ones, like a skeleton's pulse) running anywhere on the page, sampled
 * for 3 s. The launch screen's fade on a reload is the app becoming ready, so it doesn't count.
 */
async function playing(page: Page): Promise<number> {
  let most = 0;
  for (let i = 0; i < 12; i++) {
    const n = await page.evaluate(
      () =>
        document.getAnimations().filter((a) => {
          if (a instanceof CSSAnimation || a instanceof CSSTransition || a.playState !== "running") return false;
          const target = (a.effect as KeyframeEffect | null)?.target;
          return !(target instanceof Element && target.closest("[data-launch-screen]"));
        }).length
    );
    most = Math.max(most, n);
    await page.waitForTimeout(250);
  }
  return most;
}

test("nothing plays in: what a page shows is there when you arrive", async ({ signedIn: page }) => {
  test.setTimeout(90_000);
  for (const path of ["/", "/timetable", "/attendance", "/marks", "/study", "/desk", "/deadlines", "/calendar", "/skips", "/settings", "/history"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await playing(page), path).toBe(0);
  }
});

test("a page's view still slides in when you switch to it", async ({ signedIn: page }) => {
  await page.goto("/marks");
  await page.getByRole("tab", { name: "Targets" }).click();
  const pane = page.locator("[data-swipe].space-y-4");
  await expect.poll(() => pane.evaluate((e) => (e as HTMLElement).style.transform), { timeout: 3000 }).toMatch(/translateX/);
});
