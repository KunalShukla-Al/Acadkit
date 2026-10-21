import { expect, MOCK_API, serverRows, test } from "./fixtures";

// What a device that ran an older AcadKit meets: what it stored, and its old links.
test("a device that stored a theme since retired opens on brutalist and Today", async ({ signedIn: page }) => {
  await page.evaluate(() => localStorage.setItem("acadkit:theme-name", "quiet"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "brutalist");
  await expect(page.getByRole("heading", { name: /Wednesday, 7 October/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" }).last().getByRole("link")).toHaveText(["Today", "Timetable", "Attendance", "Marks", "Study"]);
});

test("an account whose saved theme was retired is put right, and OLED still picks", async ({ signedIn: page }) => {
  const [settings] = await serverRows<{ id: string }>(page.request, "settings");
  await page.request.patch(`${MOCK_API}/settings?id=eq.${settings.id}`, { data: { theme: "quiet", theme_mode: "light" } });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "brutalist");
  // The app publishes what it shows, so the account stops naming the retired one.
  await expect.poll(async () => (await serverRows<{ theme: string }>(page.request, "settings"))[0].theme).toBe("brutalist");

  await page.goto("/settings");
  await page.getByRole("tab", { name: "OLED" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "oled");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "oled");
});

test("old home-screen bookmarks land on their pages", async ({ signedIn: page }) => {
  for (const [from, to] of [
    ["/insights", "/skips"],
    ["/you#notifications", "/settings#notifications"],
    ["/plan", "/calendar"],
    ["/files", "/study"],
    ["/somewhere-gone", "/"],
  ]) {
    await page.goto(from);
    await expect(page, from).toHaveURL(to);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("a theme picked just before a reload stays picked, though its publish was cut off", async ({ signedIn: page }) => {
  await page.goto("/settings");
  // The publish never reaches the account, as when the app is closed or reloaded mid-request.
  await page.route("**/rest/v1/settings**", (route) => (route.request().method() === "PATCH" ? route.abort() : route.continue()));
  await page.getByRole("tab", { name: "OLED" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "oled");
  await page.unroute("**/rest/v1/settings**");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "oled");
  // And the account catches up.
  await expect.poll(async () => (await serverRows<{ theme: string }>(page.request, "settings"))[0].theme).toBe("oled");
});
