import { expect, MOCK_API, serverRows, test } from "./fixtures";

// What the feeds leave after "Hey Siri, AcadKit, I'm absent in OS" (migration 051), written straight into the mock.
test("Home shows what Siri marked, and Undo puts the class back as it was", async ({ signedIn: page }) => {
  const row = { device_id: "1234", subject_id: "sub-0001", date: "2026-10-07", start_time: "08:00:00", end_time: "08:50:00" };
  // The class was auto-marked present; Siri marked it absent.
  await page.request.post(`${MOCK_API}/attendance`, { data: { ...row, status: "absent", auto_marked: false } });
  await page.request.post(`${MOCK_API}/siri_marks`, {
    data: { device_id: "1234", said: "I'm absent in OS", rows: [{ ...row, before: { status: "present", auto_marked: true } }], created_at: "2026-10-07T01:50:00.000Z", undone_at: null },
  });

  await page.goto("/");
  const line = page.getByRole("status").filter({ hasText: "Siri marked you absent in OS" });
  await expect(line).toContainText("1 class");
  await line.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Put back as it was")).toBeVisible();
  await expect(line).toHaveCount(0);

  const [back] = await serverRows<{ status: string; auto_marked: boolean }>(page.request, "attendance", { subject_id: "eq.sub-0001", date: "eq.2026-10-07", start_time: "eq.08:00:00" });
  expect(back).toMatchObject({ status: "present", auto_marked: true });
  const [mark] = await serverRows<{ undone_at: string | null }>(page.request, "siri_marks");
  expect(mark.undone_at).not.toBeNull();
});
