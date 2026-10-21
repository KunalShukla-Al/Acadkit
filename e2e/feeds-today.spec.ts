import { expect, MOCK_API, serverRows, test } from "./fixtures";

// The today feed the Shortcuts and Siri read (supabase/functions/feeds), on the mock's tables.
const FEEDS = MOCK_API.replace("/rest/v1", "/functions/v1/feeds");

test("the today feed includes a test Autopilot added from a notice, saying which", async ({ signedIn: page }) => {
  await page.goto("/settings");
  await page.locator("section", { hasText: "iPhone and calendar" }).getByRole("button", { name: "Turn on" }).click();
  await expect.poll(async () => (await serverRows(page.request, "feed_tokens")).length).toBe(1);
  const [{ token }] = await serverRows<{ token: string }>(page.request, "feed_tokens");
  const [os] = (await serverRows<{ id: string; code: string }>(page.request, "subjects")).filter((s) => s.code === "21CSC202J");

  // What scripts/lib/autopilot-notice.mjs inserts after reading a notice.
  await page.request.post(`${MOCK_API}/deadlines`, {
    data: { id: "00000000-0000-4000-8000-0000000000ad", device_id: "1234", subject_id: os.id, title: "FT-III", type: "exam", due_date: "2026-10-08T09:00:00+05:30", status: "pending", priority: "high", max_marks: 50, source: "Inbox/2026-10/OS FT-III notice.pdf" },
  });

  const res = await page.request.get(`${FEEDS}/today?token=${token}`);
  expect(res.ok()).toBeTruthy();
  const day = await res.json();
  expect(day.tests).toContainEqual(expect.objectContaining({ title: "FT-III", code: "21CSC202J", type: "exam", from: "OS FT-III notice.pdf", inDays: 1 }));
  expect(day.say).toMatch(/FT-III is tomorrow\.$/);
});
