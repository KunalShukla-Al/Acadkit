import { expect, serverRows, test } from "./fixtures";

/** A Saturday the college runs as a class day, declared from the Calendar. */
test("a class Saturday follows the day order picked for it", async ({ signedIn: page }) => {
  await page.goto("/calendar");
  await page.getByRole("button", { name: "10", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Weekend");
  await page.getByRole("button", { name: "Day Order 3" }).click();
  await expect(page.getByRole("button", { name: /^10\s?D3$/ })).toBeVisible();

  const [settings] = await serverRows<{ declared_holidays: Array<{ date: string; day_order?: number }> }>(
    page.request,
    "settings"
  );
  expect(settings.declared_holidays).toContainEqual(
    expect.objectContaining({ date: "2026-10-10", day_order: 3 })
  );

  // On the day, Today lists Day Order 3's classes instead of the weekend.
  const slots = await serverRows<{ subject_id: string; day_order: number }>(page.request, "timetable_slots");
  const subjects = await serverRows<{ id: string; name: string }>(page.request, "subjects");
  const first = subjects.find((s) => s.id === slots.find((t) => t.day_order === 3)?.subject_id);
  expect(first).toBeDefined();
  await page.clock.setFixedTime(new Date("2026-10-10T07:30:00+05:30"));
  await page.goto("/");
  await expect(page.getByText("It's the weekend")).toHaveCount(0);
  await expect(page.getByText(first!.name).first()).toBeVisible();

  // Removing it makes the Saturday a weekend again.
  await page.goto("/calendar");
  await page.getByRole("button", { name: /^10\s?D3$/ }).click();
  await page.getByRole("button", { name: "Remove class day" }).click();
  await expect(page.getByRole("button", { name: "10", exact: true })).toBeVisible();
});
