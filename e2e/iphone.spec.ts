import { expect, serverRows, test } from "./fixtures";

// The mock makes the token the way migration 047 does; the Mac hasn't built any Shortcuts there.
test("Settings turns on the iPhone link, offers the calendar, and revokes it", async ({ signedIn: page }) => {
  await page.goto("/settings");
  const card = page.locator("section", { hasText: "iPhone and calendar" });
  await card.getByRole("button", { name: "Turn on" }).click();

  const add = card.getByRole("link", { name: "Add to Calendar" });
  await expect(add).toBeVisible();
  const [row] = await serverRows<{ token: string }>(page.request, "feed_tokens");
  expect(row.token).toMatch(/^[0-9a-f]{48}$/);
  await expect(add).toHaveAttribute("href", `webcal://127.0.0.1:54321/functions/v1/feeds/calendar.ics?token=${row.token}`);
  await expect(card.getByText("Your Mac builds the Shortcuts for this link")).toBeVisible();
  // A fresh iPhone: each Shortcut runs by hand first, since an automation can't answer a permission prompt.
  await card.getByRole("button", { name: "How to set it up" }).click();
  const steps = card.getByRole("listitem");
  await expect(steps.nth(1)).toContainText("Run each once from the Shortcuts app and tap Always Allow");
  await expect(steps.nth(2)).toContainText("Run Immediately");
  await expect(card.getByText("Not used yet")).toBeVisible();

  await card.getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("button", { name: "Revoke", exact: true }).last().click();
  await expect(card.getByRole("button", { name: "Turn on" })).toBeVisible();
  expect(await serverRows(page.request, "feed_tokens")).toEqual([]);
});
