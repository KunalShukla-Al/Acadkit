import { expect, MOCK_API, serverRows, test } from "./fixtures";

const STORAGE = MOCK_API.replace(/\/rest\/v1$/, "/storage/v1");

test("archiving keeps the attendance and marks patterns, and starting the next semester asks the Mac to switch folders", async ({ signedIn: page }) => {
  const before = (await serverRows<{ semester: number }>(page.request, "settings"))[0].semester;

  await page.goto("/history");
  await page.getByRole("button", { name: "Archive this semester" }).click();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page).toHaveURL(/\/wrapped/);

  // History keeps each subject's attendance and marks pattern, not just the grade.
  const [archived] = await serverRows<{ summary: { attendance?: { classes: unknown[]; total: number }; marks?: { items: unknown[] } }[] }>(page.request, "semester_archives");
  expect(archived.summary.some((r) => (r.attendance?.classes.length ?? 0) > 0 && (r.attendance?.total ?? 0) > 0)).toBe(true);
  expect(archived.summary.some((r) => (r.marks?.items.length ?? 0) > 0)).toBe(true);
  // The last card has the hand-over.
  await page.getByRole("button", { name: /^Card \d+ of \d+$/ }).last().click();
  const move = page.getByRole("checkbox", { name: new RegExp(`Move my Mac to Semester ${before + 1}'s folder`) });
  await expect(move).toBeChecked();
  await page.getByRole("button", { name: "Start the new semester" }).click();
  await page.getByRole("button", { name: "Clear and start fresh" }).click();
  await expect(page).toHaveURL(/\/$/);

  // The request is in the inbox, where the Mac's auto-sync looks.
  const listed = await page.request.post(`${STORAGE}/object/list/study-files`, { data: { prefix: "1234/inbox" } });
  const names = ((await listed.json()) as { name: string }[]).map((o) => o.name);
  expect(names.some((n) => /^semester-switch-\d+\.json$/.test(n))).toBe(true);
  await expect.poll(async () => (await serverRows<{ semester: number }>(page.request, "settings"))[0].semester).toBe(before + 1);

  // Study says it's waiting on the Mac.
  await page.goto("/files");
  await expect(page.getByRole("status").filter({ hasText: `Moving to Semester ${before + 1}'s folder` })).toBeVisible();
});
