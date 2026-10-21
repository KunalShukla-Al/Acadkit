import { expect, test } from "./fixtures";

test("the design catalog shows every primitive and every theme's tokens", async ({ signedIn: page }) => {
  await page.goto("/design");
  await expect(page.getByRole("heading", { name: "Design", level: 1 })).toBeVisible();
  for (const section of ["Figure", "Line", "Row", "Empty", "Sheet and switch", "Tokens"]) {
    await expect(page.getByRole("heading", { name: section, level: 2 })).toBeVisible();
  }
  for (const theme of ["brutalist", "oled"]) await expect(page.getByText(theme, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Open a sheet" }).click();
  const sheet = page.getByRole("dialog", { name: "Delete this deadline?" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Keep" }).click();
  await expect(sheet).toHaveCount(0);
});
