import { expect, serverRows, test, waitForLaunch } from "./fixtures";

// The plan is e2e/study-fixture/_src/acadkit_runup.json, checked by the mock as the sync checks it.
// The clock is Wednesday 7 Oct 2026 (Day Order 3).

const tickFor = (name: string) => ({ name: new RegExp(`^(Tick|Untick): ${name}$`) });

test("opens on today, with its targets and yesterday's unfinished work carried over", async ({ signedIn: page }) => {
  await page.goto("/runup");
  await expect(page.getByRole("heading", { name: /Wednesday, 7 October/ })).toBeVisible();
  await expect(page.getByText("Scheduling numericals")).toBeVisible();
  await expect(page.getByText("Two Gantt charts: FCFS and Round Robin")).toBeVisible();
  await expect(page.getByText("Pandas groupby, five snippets by hand")).toBeVisible();
  await expect(page.getByText("0/2 done")).toBeVisible();
  // Carried: both of Tuesday's tasks, each saying when it was planned.
  await expect(page.getByText("Carried from earlier · 2")).toBeVisible();
  await expect(page.getByText("Sketch the three thread models")).toBeVisible();
  await expect(page.getByText("Write BST insert from memory")).toBeVisible();
  await expect(page.getByText("planned Tue, 6 Oct").first()).toBeVisible();
  // A task's file opens in the viewer.
  await expect(page.getByRole("link", { name: /Unit 2 scheduling notes/ }).first()).toHaveAttribute("href", /\/view\?path=/);
  // The day's classes come from the timetable.
  await expect(page.getByRole("heading", { name: "Classes" })).toBeVisible();
});

test("a tick saves for the account, survives a reload and can be undone", async ({ signedIn: page, request }) => {
  await page.goto("/runup");
  const tick = page.getByRole("button", tickFor("Two Gantt charts: FCFS and Round Robin"));
  await expect(tick).toHaveAttribute("aria-pressed", "false");
  await tick.click();
  await expect(tick).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1/2 done")).toBeVisible();
  await expect.poll(async () => (await serverRows<{ task_id: string }>(request, "plan_ticks")).map((r) => r.task_id)).toEqual(["t3"]);

  await page.reload();
  await waitForLaunch(page);
  await expect(page.getByRole("button", tickFor("Two Gantt charts: FCFS and Round Robin"))).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", tickFor("Two Gantt charts: FCFS and Round Robin")).click();
  await expect.poll(async () => (await serverRows(request, "plan_ticks")).length).toBe(0);
  await expect(page.getByText("0/2 done")).toBeVisible();
});

test("a tick made offline lands once the network is back", async ({ signedIn: page, context, request }) => {
  await page.goto("/runup");
  await expect(page.getByText("0/2 done")).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", tickFor("Pandas groupby, five snippets by hand")).click();
  await expect(page.getByRole("button", tickFor("Pandas groupby, five snippets by hand"))).toHaveAttribute("aria-pressed", "true");
  expect(await serverRows(request, "plan_ticks")).toEqual([]);
  await context.setOffline(false);
  await expect.poll(async () => (await serverRows<{ task_id: string }>(request, "plan_ticks")).map((r) => r.task_id), { timeout: 15_000 }).toEqual(["t4"]);
});

test("before any plan has synced, the page says where it comes from", async ({ signedIn: page }) => {
  await page.route("**/study-files/1234/runup.json", (route) =>
    route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ statusCode: "404", error: "not_found", message: "Object not found" }) })
  );
  await page.goto("/runup");
  await expect(page.getByText("No run-up yet")).toBeVisible();
  await expect(page.getByText(/acadkit_runup\.json/)).toBeVisible();
  // And Home leaves the card out rather than showing an empty one.
  await page.goto("/");
  await expect(page.getByText(/targets? left today/)).toHaveCount(0);
});

test("ticking carried work clears it from today", async ({ signedIn: page }) => {
  await page.goto("/runup");
  await page.getByRole("button", tickFor("Sketch the three thread models")).click();
  await expect(page.getByText("Carried from earlier · 1")).toBeVisible();
  await expect(page.getByText("Sketch the three thread models")).toHaveCount(0);
  // It still shows, ticked, on the day it was planned for.
  await page.getByRole("link", { name: "Previous day" }).click();
  await expect(page).toHaveURL(/\/runup\/2026-10-06$/);
  await expect(page.getByRole("button", tickFor("Sketch the three thread models"))).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1/2 done")).toBeVisible();
});

test("moves between days, and only today carries work", async ({ signedIn: page, isMobile }) => {
  test.skip(!isMobile, "the phone's strip of days; the Mac's calendar is below");
  await page.goto("/runup");
  await page.getByRole("link", { name: "Next day" }).click();
  await expect(page).toHaveURL(/\/runup\/2026-10-08$/);
  await expect(page.getByRole("heading", { name: /Thursday, 8 October/ })).toBeVisible();
  await expect(page.getByText("One full past paper, timed")).toBeVisible();
  await expect(page.getByText(/Carried from earlier/)).toHaveCount(0);
  // The strip goes straight to a day; Today comes back.
  await page.getByRole("navigation", { name: "Days" }).getByRole("link", { name: /Friday, 9 October/ }).click();
  await expect(page.getByRole("heading", { name: /Friday, 9 October/ })).toBeVisible();
  // The test is flagged on its day, with its target.
  await expect(page.getByRole("link", { name: /in 2 days: OS FT-II/ })).toContainText("aim 12 / 15");
  // The day view's own Today, not the bar's.
  await page.getByRole("main").getByRole("link", { name: "Today", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Wednesday, 7 October/ })).toBeVisible();
});

test("a date outside the plan, or not a date, opens today", async ({ signedIn: page }) => {
  await page.goto("/runup/2026-02-30");
  await expect(page).toHaveURL("/runup");
  await expect(page.getByRole("heading", { name: /Wednesday, 7 October/ })).toBeVisible();
  await page.goto("/runup/2027-01-01");
  await expect(page).toHaveURL("/runup");
});

test("the test's page: target, how to score, past papers and what to read", async ({ signedIn: page, isMobile }) => {
  test.skip(!isMobile, "the phone's tabs; a wide screen shows every part at once");
  await page.goto("/runup");
  await page.getByRole("link", { name: "OS FT-II", exact: true }).first().click();
  await expect(page).toHaveURL(/\/runup\/event\/os-ft2$/);
  await expect(page.getByRole("heading", { level: 1, name: "OS FT-II" })).toBeVisible();
  await expect(page.getByText("Your target")).toBeVisible();
  await expect(page.getByText("about two-thirds of the paper")).toBeVisible();
  await expect(page.getByText("Draw the three thread models and recommend one for a web server")).toBeVisible();
  await expect(page.getByText("4 / 4")).toBeVisible();

  await page.getByRole("tab", { name: "PYQs 2" }).click();
  await expect(page.getByText("A web server uses multithreading but seems underutilized on a quad-core machine.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open paper" })).toHaveAttribute("href", /\/view\?path=Operating_Systems.*page=2/);
  // Filter to one unit.
  await page.getByRole("button", { name: "Unit 3" }).click();
  await expect(page.getByText("Explain Banker's algorithm with an example.")).toBeVisible();
  await expect(page.getByText("A web server uses multithreading")).toHaveCount(0);

  await page.getByRole("tab", { name: /Files/ }).click();
  await expect(page.getByText("the faculty's Unit 2 notes")).toBeVisible();

  // The tasks that prepare for it can be ticked from here too.
  await page.getByRole("tab", { name: "Plan" }).click();
  await page.getByRole("button", tickFor("One full past paper, timed")).click();
  await expect(page.getByText("Prep · 1/3 tasks")).toBeVisible();
});

test("an undated test says so", async ({ signedIn: page }) => {
  await page.goto("/runup/event/dsa-lab");
  await expect(page.getByRole("heading", { level: 1, name: "DSA lab exam" })).toBeVisible();
  await expect(page.getByText("postponed, date not announced")).toBeVisible();
});

test.describe("on a Mac-sized screen", () => {
  test.use({ viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false });

  test("the calendar sits beside the day and the arrow keys move it", async ({ signedIn: page }) => {
    await page.goto("/runup");
    await expect(page.getByRole("region", { name: "October 2026" })).toBeVisible();
    await expect(page.getByText("← → move a day · T for today")).toBeVisible();
    // The phone's strip is hidden here.
    await expect(page.getByRole("navigation", { name: "Days" })).toBeHidden();

    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("heading", { name: /Thursday, 8 October/ })).toBeVisible();
    await page.keyboard.press("t");
    await expect(page.getByRole("heading", { name: /Wednesday, 7 October/ })).toBeVisible();

    await page.getByRole("region", { name: "October 2026" }).getByRole("link", { name: /Friday, 9 October/ }).click();
    await expect(page).toHaveURL(/\/runup\/2026-10-09$/);

    // The test's page shows everything at once: no tabs.
    await page.goto("/runup/event/os-ft2");
    await expect(page.getByRole("tablist")).toBeHidden();
    await expect(page.getByText("A web server uses multithreading but seems underutilized on a quad-core machine.")).toBeVisible();
    await expect(page.getByText("the faculty's Unit 2 notes")).toBeVisible();
  });
});
