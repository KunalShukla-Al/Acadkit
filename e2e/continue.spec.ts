import { expect, MOCK_API, serverRows, test } from "./fixtures";

// Continue (migration 062): the viewer says where you're reading; your other device offers it.
// A phone hands to a computer and a computer to a phone, so the specs run as either.
const NOTES = "Operating_Systems/Unit 2 scheduling notes.pdf";
const here = (isMobile: boolean) => (isMobile ? "phone" : "computer");
const other = (isMobile: boolean) => (isMobile ? "computer" : "phone");

test("the viewer says which page you're reading, and on what", async ({ signedIn: page, isMobile }) => {
  await page.goto(`/view?${new URLSearchParams({ path: NOTES })}`);
  await expect.poll(async () => (await serverRows<{ path: string; page: number; kind: string }>(page.request, "reading_now"))[0], { timeout: 10_000 }).toMatchObject({ path: NOTES, page: 1, kind: here(isMobile) });
});

test("a page read on the other device is offered on Today and opens at that page", async ({ signedIn: page, isMobile }) => {
  // Read five minutes ago (the specs' clock is 07:30 IST, 7 Oct).
  await page.request.post(`${MOCK_API}/reading_now`, { data: { device_id: "1234", path: NOTES, page: 1, kind: other(isMobile), updated_at: "2026-10-07T01:55:00Z" } });
  await page.goto("/");
  const offer = page.getByRole("link", { name: new RegExp(`^Continue Unit 2 scheduling notes at p\\. 1 · from your ${other(isMobile)}$`) });
  await expect(offer).toBeVisible();
  await offer.click();
  await expect(page).toHaveURL(`/view?${new URLSearchParams({ path: NOTES, page: "1" })}`);
});

test("a page read on this kind of device, or long ago, isn't offered", async ({ signedIn: page, isMobile }) => {
  await page.request.post(`${MOCK_API}/reading_now`, { data: { device_id: "1234", path: NOTES, page: 1, kind: here(isMobile), updated_at: "2026-10-07T01:55:00Z" } });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Wednesday, 7 October/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Continue / })).toHaveCount(0);
});

test("a file sent from the Mac's Finder is offered on the phone without a page", async ({ signedIn: page, isMobile }) => {
  test.skip(!isMobile, "the Finder sends to the phone");
  // What scripts/mac/send-to-phone.mjs writes for a file already in the study folder.
  await page.request.post(`${MOCK_API}/reading_now`, { data: { device_id: "1234", path: NOTES, page: null, kind: "computer", updated_at: "2026-10-07T01:58:00Z" } });
  await page.goto("/");
  await page.getByRole("link", { name: /^Continue Unit 2 scheduling notes · from your computer$/ }).click();
  await expect(page).toHaveURL(`/view?${new URLSearchParams({ path: NOTES })}`);
  await expect(page.getByText("Process scheduling")).toBeVisible();
});
