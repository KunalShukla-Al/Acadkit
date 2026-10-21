import { expect, test } from "./fixtures";

// The mock measures e2e/study-fixture the way the sync measures the bucket (scripts/lib/storage.mjs).
test("Study shows how much of the free 1 GB the folder takes", async ({ signedIn: page }) => {
  await page.goto("/files");
  const meter = page.getByRole("meter", { name: "Storage used" });
  await expect(meter).toHaveAttribute("aria-valuetext", /^[\d.]+ (B|KB|MB) of 1 GB$/);
  await expect(page.getByText(/didn't fit/)).toHaveCount(0);
});
