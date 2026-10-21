import { expect, test } from "./fixtures";

test("Marks → Targets shows how you score by kind of assessment", async ({ signedIn: page }) => {
  await page.goto("/marks");
  await page.getByRole("radio", { name: "Targets" }).or(page.getByRole("tab", { name: "Targets" })).or(page.getByRole("button", { name: "Targets" })).first().click();
  const card = page.getByRole("region", { name: "How you score, by kind of assessment" });
  await expect(card).toBeVisible();
  // The seeded semester: assignments run above each subject's usual, CTs below.
  await expect(card.getByRole("listitem").filter({ hasText: "Assignments" })).toContainText("above your usual");
  await expect(card.getByRole("listitem").filter({ hasText: "Class tests" })).toContainText("below your usual");
});
