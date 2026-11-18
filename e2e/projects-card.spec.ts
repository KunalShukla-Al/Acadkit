import { expect, test } from "./fixtures";

// The projects come from e2e/study-fixture/_src, checked by the mock as the sync checks them.
test("the Projects card folds to one line and opens to status and to-dos", async ({ signedIn: page }) => {
  await page.goto("/study");
  const card = page.getByRole("button", { name: /Projects/ });
  // Dated to-dos come first, soonest first.
  await expect(card).toContainText("1 on · 3 to-dos · next: Hand in the form");
  await expect(page.getByText("Delivering reminders")).toHaveCount(0);
  await card.click();
  await expect(page.getByRole("link", { name: "jobq" })).toHaveAttribute("href", "https://github.com/KunalShukla-Al/jobq");
  await expect(page.getByText("Delivering reminders")).toBeVisible();
  await expect(page.getByText("Tag v1.0.0")).toBeVisible();
  await expect(page.getByText("Upcoming", { exact: true })).toBeVisible();
  await expect(page.getByText("overdue")).toBeVisible();
  await expect(page.getByText("by Fri, 9 Oct")).toBeVisible();
  await expect(page.getByText("Updated Tue, 6 Oct")).toBeVisible();
});

test("Study shows no week card or recent-files row", async ({ signedIn: page }) => {
  await page.goto("/files");
  await expect(page.getByRole("button", { name: /Projects/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /This week/ })).toHaveCount(0);
  await expect(page.getByText(/new files? in the last/)).toHaveCount(0);
});
