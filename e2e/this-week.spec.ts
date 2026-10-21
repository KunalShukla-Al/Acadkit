import { expect, test } from "./fixtures";

// The notices and projects come from e2e/study-fixture/_src, checked by the mock as the sync checks them.
test("This week folds to one line and opens to the notices, with the file they point at", async ({ signedIn: page }) => {
  await page.goto("/files");
  const card = page.getByRole("button", { name: /This week/ });
  // Folded to one line until opened.
  await expect(card).toContainText("1 notice");
  await expect(page.getByText("Lab 4 is due at the next lab: bring the zip on a pen drive")).toHaveCount(0);
  await card.click();
  await expect(page.getByText("Lab 4 is due at the next lab: bring the zip on a pen drive")).toBeVisible();
  await expect(page.getByText("OS lab WhatsApp · Tue, 6 Oct")).toBeVisible();
  // Its file sits right under it.
  await expect(page.getByText("Lab 4 files.zip").first()).toBeVisible();
  // Past its end date: gone on its own.
  await expect(page.getByText("An old notice that has run out")).toHaveCount(0);
});

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
  await expect(page.getByText("Waiting", { exact: true })).toBeVisible();
  await expect(page.getByText("overdue")).toBeVisible();
  await expect(page.getByText("by Fri, 9 Oct")).toBeVisible();
  await expect(page.getByText("Updated Tue, 6 Oct")).toBeVisible();
});

test("a notice swiped right goes away, can be undone, and stays gone after a reload", async ({ signedIn: page }) => {
  await page.goto("/files");
  const card = page.getByRole("button", { name: /This week/ });
  await card.click();
  const text = page.getByText("Lab 4 is due at the next lab: bring the zip on a pen drive");
  await expect(text).toBeVisible();
  // Dragged right past the threshold, like a file row.
  const box = (await text.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 20, y);
  await page.mouse.down();
  for (let dx = 10; dx <= 160; dx += 10) await page.mouse.move(box.x + 20 + dx, y);
  await page.mouse.up();
  await expect(text).toHaveCount(0);
  // With nothing else due in the fixture's week, the card hides once its only notice is gone.
  await expect(page.getByRole("button", { name: /This week.*notice/ })).toHaveCount(0);
  // Undo brings it back.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(text).toBeVisible();
  // Removed again from the keyboard (a screen reader's way in), it stays removed on this device.
  await page.getByRole("button", { name: "Remove this notice" }).focus();
  await page.keyboard.press("Enter");
  await expect(text).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: /This week.*notice/ })).toHaveCount(0);
});
