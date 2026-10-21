import { expect, MOCK_API, serverRows, test } from "./fixtures";

// The real feeds handler (supabase/functions/feeds/handle.ts) answering from the mock's tables, as Siri and the share sheet call it.
const FEEDS = MOCK_API.replace(/\/rest\/v1$/, "/functions/v1/feeds");

test("Siri's questions get answers from the account, and 'I'm absent' can be undone on Today", async ({ signedIn: page }) => {
  const made = await page.request.post(`${MOCK_API}/feed_tokens`, { data: { device_id: "1234" }, headers: { Prefer: "return=representation" } });
  const [{ token }] = (await made.json()) as { token: string }[];
  const ask = async (q: string) => (await page.request.get(`${FEEDS}/ask?token=${token}&q=${encodeURIComponent(q)}`)).json();

  // Today's first class, from the today feed.
  const day = await (await page.request.get(`${FEEDS}/today?token=${token}`)).json();
  expect(day).toMatchObject({ date: "2026-10-07", kind: "working" });
  const first = day.classes[0] as { short: string; code: string };

  const skip = await ask(`can I skip ${first.short}`);
  expect(skip).toMatchObject({ kind: "skip", subject: first.code });
  expect(skip.say).toMatch(/^(Yes|Better not|No)\. /);
  expect((await ask("when is my next test")).kind).toBe("next-test");
  expect((await ask("what's the weather")).say).toMatch(/^I can tell you/);

  const absent = await ask(`I'm absent in ${first.short}`);
  expect(absent.say).toMatch(new RegExp(`^Marked you absent in ${first.short}: \\d+ class(es)? today\\.`));
  const rows = await serverRows<{ status: string; date: string }>(page.request, "attendance", { date: "eq.2026-10-07", status: "eq.absent" });
  expect(rows.length).toBe(absent.marked);

  await page.goto("/");
  const line = page.getByRole("status").filter({ hasText: `Siri marked you absent in ${first.short}` });
  await line.getByRole("button", { name: "Undo" }).click();
  await expect(line).toHaveCount(0);
  expect(await serverRows(page.request, "attendance", { date: "eq.2026-10-07", status: "eq.absent" })).toHaveLength(0);
});

test("the share endpoint queues a file for the Mac, and a bad token is refused", async ({ page }) => {
  const request = page.request;
  const made = await request.post(`${MOCK_API}/feed_tokens`, { data: { device_id: "1234" }, headers: { Prefer: "return=representation" } });
  const [{ token }] = (await made.json()) as { token: string }[];
  const res = await request.post(`${FEEDS}/share?token=${token}&name=IMG_4021`, { data: Buffer.from("photo"), headers: { "Content-Type": "image/jpeg" } });
  expect(res.status()).toBe(201);
  expect(await res.json()).toEqual({ path: "Inbox/IMG_4021.jpg" });
  const [upload] = await serverRows<{ path: string; status: string }>(request, "study_uploads");
  expect(upload).toMatchObject({ path: "Inbox/IMG_4021.jpg", status: "pending" });
  expect((await request.get(`${FEEDS}/today?token=${"0".repeat(48)}`)).status()).toBe(401);
});

test("leaving early marks the classes still to come, and Home can undo it", async ({ signedIn: page }) => {
  const made = await page.request.post(`${MOCK_API}/feed_tokens`, { data: { device_id: "1234" }, headers: { Prefer: "return=representation" } });
  const [{ token }] = (await made.json()) as { token: string }[];
  // The specs' morning is 7:30 IST, before any class: the whole day is still to come.
  const day = await (await page.request.get(`${FEEDS}/today?token=${token}`)).json();
  expect(day.leave).toMatch(/^Mark the rest absent\? /);
  const left = await (await page.request.post(`${FEEDS}/leave?token=${token}`)).json();
  expect(left.marked).toBe(day.classes.length);

  await page.goto("/");
  const line = page.getByRole("status").filter({ hasText: "Left SRM early, marked absent" });
  await line.getByRole("button", { name: "Undo" }).click();
  await expect(line).toHaveCount(0);
  expect(await serverRows(page.request, "attendance", { date: "eq.2026-10-07", status: "eq.absent" })).toHaveLength(0);
});

