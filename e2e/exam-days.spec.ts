import type { Page } from "@playwright/test";
import { expect, MOCK_API, serverRows, test } from "./fixtures";

/**
 * Every tab and page with the clock moved to each exam day, and to every
 * day from the end of teaching to the last end-sem, morning and evening:
 * the dates the app is most used and least tested on. Most specs pin the
 * specs' day in what they expect, so this doesn't rerun them; it walks the
 * app on those days and fails on a crash, a page error or a screen without
 * its title.
 */
const SCREENS = ["/", "/timetable", "/attendance", "/marks", "/study", "/runup", "/deadlines", "/calendar", "/skips", "/settings", "/history"];
/** 21-30 Nov: past the mock's last teaching day (18 Nov), through SRM's Sem 3 end-sems. */
const RUN_IN = ["2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30"];
/** Each end-sem's day and subject, at 2:00 PM. */
const END_SEMS: [string, string][] = [["2026-11-25", "21MAB201T"], ["2026-11-26", "21CSS202T"], ["2026-11-27", "21CSC201J"], ["2026-11-30", "21CSC202J"]];

async function walk(page: Page, day: string) {
  const errors: string[] = [];
  // Jumping the clock hours ahead expires the session, so the auth client refreshes it as a page
  // starts; WebKit reports that request, cut off by the next page, as an access-control failure.
  // The auth client tries again, and the screen still has to load.
  const refreshCutOff = /auth\/v1\/token\?grant_type=refresh_token due to access control checks/;
  page.on("pageerror", (e) => !refreshCutOff.test(e.message) && errors.push(e.message));
  for (const time of ["07:30", "19:00"]) {
    await page.clock.setFixedTime(new Date(`${day}T${time}:00+05:30`));
    for (const path of SCREENS) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }), `${day} ${time} ${path}`).toBeVisible();
      await expect(page.getByText("Something broke on this screen"), `${day} ${time} ${path}`).toHaveCount(0);
      // Leave only once its requests are done: WebKit reports a request cut off by the next page as
      // a page error (an import, a token refresh after the clock's jump), which isn't the app's.
      await page.waitForLoadState("networkidle");
    }
  }
  expect(errors, day).toEqual([]);
}

test("the days of the semester's tests", async ({ signedIn: page }) => {
  test.setTimeout(240_000);
  const exams = await serverRows<{ due_date: string; type: string }>(page.request, "deadlines");
  const days = [...new Set(exams.filter((d) => d.type === "exam").map((d) => new Date(d.due_date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })))];
  expect(days.length).toBeGreaterThan(0);
  for (const day of days) await walk(page, day);
});

for (const day of RUN_IN) {
  test(`the run-in to the end-sems: ${day}`, async ({ signedIn: page }) => {
    test.setTimeout(120_000);
    await walk(page, day);
    // Past the last teaching day there are no classes, and Today says so rather than guessing.
    await page.goto("/");
    await expect(page.getByText(/^(Classes are over|Semester's over)$/)).toBeVisible();
  });
}

test("Today names each end-sem on its day, and moves on once it's sat", async ({ signedIn: page }) => {
  test.setTimeout(60_000);
  const subjects = await serverRows<{ id: string; code: string }>(page.request, "subjects");
  for (const [i, [day, code]] of END_SEMS.entries()) {
    await page.request.post(`${MOCK_API}/deadlines`, {
      data: { id: `00000000-0000-4000-8000-0000000000e${i}`, device_id: "1234", subject_id: subjects.find((s) => s.code === code)!.id, title: "End-sem", type: "exam", due_date: `${day}T14:00:00+05:30`, status: "pending", priority: "high" },
    });
  }
  // With teaching over, the day's card says what's left: the next end-sem, or that the semester is.
  const says = async (day: string, time: string, line: string) => {
    await page.clock.setFixedTime(new Date(`${day}T${time}:00+05:30`));
    await page.goto("/");
    await expect(page.getByText(line, { exact: true }), `${day} ${time}`).toBeVisible();
  };
  await says("2026-11-24", "19:00", "TBVP End-sem is tomorrow");
  await says("2026-11-25", "07:30", "TBVP End-sem is today");
  await says("2026-11-25", "19:00", "FDS End-sem is tomorrow");
  await says("2026-11-27", "19:00", "OS End-sem is in 3 days");
  await says("2026-11-30", "07:30", "OS End-sem is today");
  await says("2026-11-30", "19:00", "See you next term.");
});
