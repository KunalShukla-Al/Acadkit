import { expect, serverRows, test, waitForLaunch } from "./fixtures";

// The plan is e2e/study-fixture/_src/acadkit_runup.json, checked by the mock as the sync checks it.
// The clock is Wednesday 7 Oct 2026 (Day Order 3).

const tickFor = (name: string) => ({ name: new RegExp(`^(Tick|Untick): ${name}$`) });

test("opens on today, with its targets and yesterday's unfinished work carried over", async ({ signedIn: page }) => {
  await page.goto("/desk");
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
  await page.goto("/desk");
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

test("a task carries its video and the past questions to write, each with its own tick", async ({ signedIn: page, request }) => {
  await page.goto("/desk");
  const task = page.locator('[data-task="t3"]');
  // The file opens at the page the plan names; the video opens on YouTube.
  await expect(task.getByRole("link", { name: /Unit 2 scheduling notes/ }).first()).toHaveAttribute("href", /page=2/);
  await expect(task.getByRole("link", { name: /Round robin scheduling\s*16 min · Gate Smashers/ })).toHaveAttribute("href", "https://www.youtube.com/watch?v=TxjIlNYRZ5M");

  await task.getByText("Past questions to write").click();
  await expect(task.getByText("0/2 written")).toBeVisible();
  await expect(task.getByText("Draw the Gantt chart for round robin")).toBeVisible();
  await expect(task.getByRole("link", { name: "Open the paper: Jul 2025 · B22a" })).toHaveAttribute("href", /\/view\?path=.*page=1/);
  // A question whose paper isn't in the folder has no link.
  await expect(task.getByRole("link", { name: /Nov 2024/ })).toHaveCount(0);

  await task.getByRole("button", { name: "Written: Jul 2025 · B22a" }).click();
  await expect(task.getByText("1/2 written")).toBeVisible();
  await expect.poll(async () => (await serverRows<{ task_id: string }>(request, "plan_ticks")).map((r) => r.task_id)).toEqual(["t3>jul-2025-b22a"]);
  // The task itself is still to do: the day's count hasn't moved.
  await expect(page.getByText("0/2 done")).toBeVisible();
  await expect(page.getByRole("button", tickFor("Two Gantt charts: FCFS and Round Robin"))).toHaveAttribute("aria-pressed", "false");
});

test("a tick made offline lands once the network is back", async ({ signedIn: page, context, request }) => {
  await page.goto("/desk");
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
  await page.goto("/desk");
  await expect(page.getByText("No day plan yet")).toBeVisible();
  await expect(page.getByText(/acadkit_runup\.json/)).toBeVisible();
  // And Home leaves the card out rather than showing an empty one.
  await page.goto("/");
  await expect(page.getByText(/targets? left today/)).toHaveCount(0);
});

test("ticking carried work clears it from today", async ({ signedIn: page }) => {
  await page.goto("/desk");
  await page.getByRole("button", tickFor("Sketch the three thread models")).click();
  await expect(page.getByText("Carried from earlier · 1")).toBeVisible();
  await expect(page.getByText("Sketch the three thread models")).toHaveCount(0);
  // It still shows, ticked, on the day it was planned for.
  await page.getByRole("link", { name: "Previous day" }).click();
  await expect(page).toHaveURL(/\/desk\/2026-10-06$/);
  await expect(page.getByRole("button", tickFor("Sketch the three thread models"))).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1/2 done")).toBeVisible();
});

test("moves between days, and only today carries work", async ({ signedIn: page, isMobile }) => {
  test.skip(!isMobile, "the phone's strip of days; the Mac's calendar is below");
  await page.goto("/desk");
  await page.getByRole("link", { name: "Next day" }).click();
  await expect(page).toHaveURL(/\/desk\/2026-10-08$/);
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
  await page.goto("/desk/2026-02-30");
  await expect(page).toHaveURL("/desk");
  await expect(page.getByRole("heading", { name: /Wednesday, 7 October/ })).toBeVisible();
  await page.goto("/desk/2027-01-01");
  await expect(page).toHaveURL("/desk");
});

test("the test's page: target, how to score, past papers and what to read", async ({ signedIn: page, isMobile }) => {
  test.skip(!isMobile, "the phone's tabs; a wide screen shows every part at once");
  await page.goto("/desk");
  await page.getByRole("link", { name: "OS FT-II", exact: true }).first().click();
  await expect(page).toHaveURL(/\/desk\/event\/os-ft2$/);
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
  await page.goto("/desk/event/dsa-lab");
  await expect(page.getByRole("heading", { level: 1, name: "DSA lab exam" })).toBeVisible();
  await expect(page.getByText("postponed, date not announced")).toBeVisible();
});

test.describe("on a Mac-sized screen", () => {
  test.use({ viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false });

  test("the calendar sits beside the day and the arrow keys move it", async ({ signedIn: page }) => {
    await page.goto("/desk");
    await expect(page.getByRole("region", { name: "October 2026" })).toBeVisible();
    await expect(page.getByText("← → move a day · T for today")).toBeVisible();
    // The phone's strip is hidden here.
    await expect(page.getByRole("navigation", { name: "Days" })).toBeHidden();

    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("heading", { name: /Thursday, 8 October/ })).toBeVisible();
    await page.keyboard.press("t");
    await expect(page.getByRole("heading", { name: /Wednesday, 7 October/ })).toBeVisible();

    await page.getByRole("region", { name: "October 2026" }).getByRole("link", { name: /Friday, 9 October/ }).click();
    await expect(page).toHaveURL(/\/desk\/2026-10-09$/);

    // The test's page shows everything at once: no tabs.
    await page.goto("/desk/event/os-ft2");
    await expect(page.getByRole("tab", { name: /^PYQs/ })).toBeHidden();
    await expect(page.getByText("A web server uses multithreading but seems underutilized on a quad-core machine.")).toBeVisible();
    await expect(page.getByText("the faculty's Unit 2 notes")).toBeVisible();
  });
});

// The Desk's Priorities and Practice: e2e/study-fixture/_src/acadkit_desk.json, checked and split by the mock.

test("Priorities ranks a test's topics and lists every question of a unit", async ({ signedIn: page }) => {
  await page.goto("/desk");
  await page.getByRole("tab", { name: "Priorities" }).click();
  await expect(page).toHaveURL("/desk/priorities");
  // The next test opens first, with its window and countdown.
  await expect(page.getByRole("heading", { name: "FT-III" })).toBeVisible();
  await expect(page.getByText("in 5 days")).toBeVisible();
  const ranked = page.getByRole("region", { name: "Topics by expected marks" });
  await expect(ranked.getByRole("link", { name: /CPU scheduling.*asked in 4 of 4 papers.*12\.5/ })).toHaveAttribute("href", "/desk/practice?course=OS&topic=sched");
  await expect(page.getByRole("region", { name: "Smallest set" }).getByText("82%")).toBeVisible();
  await expect(page.getByRole("link", { name: "Prediction checks" })).toHaveAttribute("href", /\/view\?path=Operating_Systems/);
  // The end-sem shows its lock-in by position.
  await page.getByRole("button", { name: "End-sem" }).click();
  await expect(page.getByRole("region", { name: "Lock-in by position" }).getByText("Q22")).toBeVisible();

  await page.getByRole("tab", { name: "By unit" }).click();
  await expect(page).toHaveURL(/view=unit/);
  await page.getByRole("button", { name: /CPU scheduling/ }).click();
  await expect(page.getByText("Draw the Gantt chart for round robin with quantum 2")).toBeVisible();
  await expect(page.getByText(/asked in 2 papers · FT-II 2025 · B22a; End-sem May 2025 · B22b/)).toBeVisible();
});

test("Practice grades a pick, flags a wrong one, and saves it for the account", async ({ signedIn: page, request }) => {
  await page.goto("/desk/practice");
  await expect(page.getByText("Which algorithm can starve a long process?")).toBeVisible();
  await expect(page.getByText("1 / 3")).toBeVisible();
  await page.getByRole("button", { name: /^C\s*Round robin/ }).click();
  // The key marks the right one; the wrong pick is flagged for revision.
  await expect(page.getByRole("button", { name: /^B\s*SJF/ })).toHaveClass(/border-good/);
  await expect(page.getByRole("button", { name: "To revise" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("SJF keeps picking shorter jobs.")).toBeVisible();
  await expect
    .poll(async () => (await serverRows<{ item_key: string; pick: string; result: string; flag: boolean }>(request, "desk_progress")).map((r) => [r.item_key, r.pick, r.result, r.flag]))
    .toEqual([["OS/os-es-2025-05/A1", "C", "wrong", true]]);

  // Filters live in the URL: the wrong ones come back to redo.
  await page.getByRole("combobox", { name: "Status" }).selectOption("wrong");
  await expect(page).toHaveURL(/status=wrong/);
  await expect(page.getByText("1 / 1")).toBeVisible();
  await page.reload();
  await waitForLaunch(page);
  await expect(page.getByRole("button", { name: /^C\s*Round robin/ })).toHaveAttribute("aria-pressed", "true");
});

test("a written question opens its worked answer and its paper on their pages", async ({ signedIn: page }) => {
  await page.goto("/desk/practice?part=B");
  await expect(page.getByText("Draw the Gantt chart for round robin with quantum 2")).toBeVisible();
  await page.getByRole("button", { name: "Show answer" }).click();
  await expect(page.getByRole("link", { name: /Open the worked answer, page 4/ })).toHaveAttribute("href", /deadlocks.*page=4/);
  await expect(page.getByRole("link", { name: "Paper, page 2" })).toHaveAttribute("href", /scheduling.*page=2/);
  await page.getByRole("button", { name: "Mark attempted" }).click();
  await expect(page.getByRole("button", { name: "Attempted" })).toHaveAttribute("aria-pressed", "true");
});

test("the corner steps aside on the Desk, whose controls sit there", async ({ signedIn: page }) => {
  const corner = page.getByRole("button", { name: /Calendar\. Hold for/ });
  await page.goto("/desk/practice");
  await expect(page.getByText("Which algorithm can starve a long process?")).toBeVisible();
  await expect(corner).toBeHidden();
  await page.goto("/");
  await expect(corner).toBeVisible();
});

test("Ask Claude offers Claude on the web when the Mac is away", async ({ signedIn: page }) => {
  await page.goto("/desk/practice");
  await page.getByRole("button", { name: "Ask Claude" }).click();
  await expect(page.getByRole("link", { name: "Open in Claude instead" })).toHaveAttribute("href", /^https:\/\/claude\.ai\/new\?q=Course%3A%20Operating%20Systems/);
});

test("the Desk's tests, windows and units show on Deadlines, the Calendar and the Subject page", async ({ signedIn: page }) => {
  await page.goto("/deadlines");
  const tests = page.getByRole("region", { name: "Tests" });
  await expect(tests.getByRole("link", { name: /OS\s*FT-III.*12 Oct – 16 Oct window.*units 2, 3.*in 5 days/ })).toBeVisible();

  await page.goto("/calendar");
  await expect(page.getByText("test window or semester date")).toBeVisible();
  await page.getByRole("button", { name: /^13/ }).first().click();
  await expect(page.getByText("FT-III window")).toBeVisible();

  await page.goto("/subject/21CSC202J");
  const units = page.getByRole("region", { name: "Units and videos" });
  await units.getByRole("button", { name: /Unit 2/ }).click();
  await units.getByRole("button", { name: "Learning" }).click();
  await expect(units.getByRole("button", { name: "Learning" })).toHaveAttribute("aria-pressed", "true");
  await units.getByRole("button", { name: "Mark Round robin scheduling watched" }).click();
  await expect(units.getByRole("button", { name: "Watched Round robin scheduling" })).toBeVisible();
});
