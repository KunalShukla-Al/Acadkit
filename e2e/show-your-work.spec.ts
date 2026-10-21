import { captureShares, expect, sharedFiles, test } from "./fixtures";

// Show your work: a number on a screen, tapped, plays how it was worked out (src/components/explainer).
test("attendance's numbers open their explainers", async ({ signedIn: page }) => {
  await page.goto("/attendance");
  const row = page.getByRole("button", { name: /Operating Systems/ }).first();
  await row.click();
  await page.getByRole("button", { name: /^Attendance in .*: how it's worked out$/ }).first().click();
  const sheet = page.getByRole("dialog");
  const player = sheet.getByRole("figure", { name: /^Attendance in / });
  await expect(player).toBeVisible();
  await expect(player.getByRole("button", { name: /^Step 1 of \d$/ })).toHaveAttribute("aria-current", "step");
  await expect(sheet.getByText(/^(You've marked \d+ classes of |On \d{1,2} [A-Z][a-z]{2} the portal had you at )/)).toBeVisible();
});

test("a subject's classes to spare play their working to the end", async ({ signedIn: page }) => {
  await page.goto("/attendance");
  await page.getByRole("button", { name: /Operating Systems/ }).first().click();
  await page.getByRole("button", { name: /^Classes you (can skip|need) in .*: how it's worked out$/ }).first().click();
  const player = page.getByRole("dialog").getByRole("figure");
  await player.getByRole("button", { name: "Pause" }).click();
  await player.getByRole("button", { name: "Step 3 of 3" }).click();
  await expect(player.locator("figcaption")).toContainText(/^A part of a class (can't be skipped|doesn't count), so you (can skip|need) \d+ class/);
  await expect(player.getByRole("button", { name: "Next step" })).toBeDisabled();
});

test("a day on the survival plan says why it's free or not", async ({ signedIn: page }) => {
  await page.goto("/skips");
  // A day's own button, named by its date ("7 Oct"), not the screen's SGPA.
  await page.getByRole("button", { name: /^(\w{3}, )?\d{1,2} \w{3}: how it's worked out$/ }).first().click();
  const player = page.getByRole("dialog").getByRole("figure");
  await expect(player).toBeVisible();
  await player.getByRole("button", { name: "Pause" }).click();
  const last = player.getByRole("button", { name: /^Step \d+ of \d+$/ }).last();
  await last.click();
  await expect(player.locator("figcaption")).toContainText(/so the day is free\.|so it isn't free\./);
});

test("the predicted SGPA and a target's marks needed open theirs", async ({ signedIn: page }) => {
  await page.goto("/marks");
  // The Marks card's line under the dial.
  await page.getByRole("button", { name: "Predicted SGPA: how it's worked out" }).last().click();
  const sgpa = page.getByRole("dialog").getByRole("figure");
  await sgpa.getByRole("button", { name: "Pause" }).click();
  // The subjects first, then the sum: it's the last step, or the one before a note on subjects left out.
  const dots = sgpa.getByRole("button", { name: /^Step \d+ of \d+$/ });
  for (const i of [1, 2]) {
    await dots.nth((await dots.count()) - i).click();
    if (/an SGPA of/.test((await sgpa.locator("figcaption").textContent()) ?? "")) break;
  }
  await expect(sgpa.locator("figcaption")).toContainText(/an SGPA of \d+\.\d\d\./);
  await page.keyboard.press("Escape");
  await page.getByRole("radio", { name: "Targets" }).or(page.getByRole("tab", { name: "Targets" })).or(page.getByRole("button", { name: "Targets" })).first().click();
  await page.getByRole("button", { name: /^Marks needed for .* in .*: how it's worked out$/ }).first().click();
  // It plays on its own, so under load the first step can be gone before it's read: pause, then go back to it.
  const needed = page.getByRole("dialog").getByRole("figure");
  await needed.getByRole("button", { name: "Pause" }).click();
  await needed.getByRole("button", { name: /^Step 1 of \d+$/ }).click();
  await expect(needed.locator("figcaption")).toHaveText(/^You've banked [\d.]+ of the [\d.]+ marks played so far in /);
});

test("captions stay off once turned off, and reduced motion gets stills", async ({ signedIn: page }) => {
  await page.goto("/attendance");
  await page.getByRole("button", { name: /Operating Systems/ }).first().click();
  const open = () => page.getByRole("button", { name: /^Attendance in .*: how it's worked out$/ }).first().click();
  await open();
  const captions = page.getByRole("dialog").getByRole("button", { name: "Captions" });
  await expect(captions).toHaveAttribute("aria-pressed", "true");
  await captions.click();
  await page.reload();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: /Operating Systems/ }).first().click();
  await open();
  // Reduced motion: stills, every step at once, nothing to play.
  const stills = page.getByRole("dialog").getByRole("figure");
  await expect(stills.getByRole("img")).toHaveCount(await stills.getByRole("listitem").count());
  await expect(stills.getByRole("button", { name: "Play" })).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.keyboard.press("Escape");
  await open();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Captions" })).toHaveAttribute("aria-pressed", "false");
});

test("an explainer saves as a video", async ({ signedIn: page, browserName, isMobile }) => {
  test.setTimeout(90_000);
  // An iPhone saves through the share sheet (src/lib/saveFile.ts), anything else downloads.
  const iphone = browserName === "webkit" && isMobile;
  if (iphone) await captureShares(page);
  await page.goto("/attendance");
  await page.getByRole("button", { name: /Operating Systems/ }).first().click();
  await page.getByRole("button", { name: /^Classes you (can skip|need) in .*: how it's worked out$/ }).first().click();
  const player = page.getByRole("dialog").getByRole("figure");
  await player.getByRole("button", { name: "Make a video" }).click();
  await expect(player.getByRole("button", { name: "Recording" })).toBeDisabled();
  await expect(player.getByRole("button", { name: "Save video" })).toBeVisible({ timeout: 60_000 });
  const name = /^Classes you (can skip|need) in .*\.(mp4|webm)$/;
  if (iphone) {
    await player.getByRole("button", { name: "Save video" }).click();
    await expect.poll(async () => (await sharedFiles(page)).map((f) => f.name)).toEqual([expect.stringMatching(name)]);
    return;
  }
  const download = page.waitForEvent("download");
  await player.getByRole("button", { name: "Save video" }).click();
  expect((await download).suggestedFilename()).toMatch(name);
});
