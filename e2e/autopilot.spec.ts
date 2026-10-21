import { expect, MOCK_API, serverRows, test } from "./fixtures";

// What the Mac leaves after Autopilot reads a notice (migration 053), written straight into the mock.
test("Today shows what Autopilot added from a notice, and Undo takes it off the list", async ({ signedIn: page }) => {
  const id = "11111111-2222-4333-8444-555555555555";
  await page.request.post(`${MOCK_API}/deadlines`, {
    data: { id, device_id: "1234", subject_id: "sub-0001", title: "FT-II", type: "exam", due_date: "2026-10-09T04:30:00.000Z", status: "pending", priority: "high", source: "Inbox/notice.jpg" },
  });
  await page.request.post(`${MOCK_API}/autopilot_actions`, {
    data: { device_id: "1234", source: "Inbox/notice.jpg", said: "Added OS FT-II (Fri, 9 Oct).", confidence: 0.9, deadline_ids: [id], created_at: "2026-10-07T01:50:00.000Z", undone_at: null },
  });

  await page.goto("/");
  const line = page.getByRole("status").filter({ hasText: "Added OS FT-II (Fri, 9 Oct)" });
  await expect(line).toContainText("from notice.jpg");

  // The deadline itself, on the Deadlines page, says where it came from.
  await page.goto("/deadlines");
  await page.getByRole("button", { name: "Upcoming deadlines" }).click();
  await page.getByRole("button", { name: "Operating Systems in 2 days" }).click();
  await expect(page.getByText("Autopilot read this from notice.jpg.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Autopilot read this from notice.jpg.")).toHaveCount(0);

  await page.goto("/");
  await line.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Taken off your list")).toBeVisible();
  await expect(line).toHaveCount(0);
  expect(await serverRows(page.request, "deadlines", { id: `eq.${id}` })).toEqual([]);
  const [action] = await serverRows<{ undone_at: string | null }>(page.request, "autopilot_actions");
  expect(action.undone_at).not.toBeNull();
});

// What the Mac leaves after reading a portal screenshot (migration 059): the new rows, and the action with every row as it was.
test("Undo on a portal screenshot's import puts the attendance and marks back as they were", async ({ signedIn: page }) => {
  const [was] = await serverRows<Record<string, unknown>>(page.request, "portal_snapshots", { subject_code: "eq.21CSC202J" });
  const before = Object.fromEntries(Object.entries(was).filter(([k]) => k !== "id" && k !== "device_id"));
  await page.request.post(`${MOCK_API}/portal_snapshots?on_conflict=device_id,subject_code`, {
    data: { device_id: "1234", subject_code: "21CSC202J", conducted: 48, absent: 12, percentage: 75, as_of: "2026-10-07", synced_at: "2026-10-07T01:00:00.000Z" },
  });
  await page.request.post(`${MOCK_API}/portal_snapshot_history`, { data: { id: "h-shot", device_id: "1234", subject_code: "21CSC202J", conducted: 48, absent: 12, percentage: 75, as_of: "2026-10-07", source: "screenshot" } });
  await page.request.post(`${MOCK_API}/marks`, { data: { id: "m-shot", device_id: "1234", subject_id: "sub-0001", component_type: "CT", label: "FJ-II", marks_obtained: 9, max_marks: 15, is_external: false, source: "portal" } });
  await page.request.post(`${MOCK_API}/autopilot_actions`, {
    data: {
      device_id: "1234",
      kind: "portal",
      source: "Inbox/IMG_7001.PNG",
      said: "Portal: attendance OS 75.0% (was 73.8%); marks OS FJ-II 9/15 (new).",
      confidence: 0.9,
      deadline_ids: [],
      changes: { snapshots: [{ code: "21CSC202J", before }], history: ["h-shot"], marks: [{ id: "m-shot", before: null }] },
      created_at: "2026-10-07T01:50:00.000Z",
      undone_at: null,
    },
  });

  await page.goto("/");
  const line = page.getByRole("status").filter({ hasText: "Portal: attendance OS 75.0% (was 73.8%)" });
  await expect(line).toContainText("from IMG_7001.PNG");
  await line.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Put back as it was")).toBeVisible();
  await expect(line).toHaveCount(0);

  const [now] = await serverRows<Record<string, unknown>>(page.request, "portal_snapshots", { subject_code: "eq.21CSC202J" });
  expect(now).toMatchObject({ conducted: was.conducted, absent: was.absent, percentage: was.percentage });
  expect(await serverRows(page.request, "portal_snapshot_history", { id: "eq.h-shot" })).toEqual([]);
  expect(await serverRows(page.request, "marks", { id: "eq.m-shot" })).toEqual([]);
});

// A past paper Autopilot read but isn't sure of (migration 060), waiting on Today.
test("a doubtful past paper asks on Today, and Add to past papers says yes for the Mac", async ({ signedIn: page }) => {
  await page.request.post(`${MOCK_API}/suggestions`, {
    data: {
      device_id: "1234",
      key: "paper:abc",
      kind: "paper",
      status: "pending",
      source: "Operating_Systems/07_PYQs/IMG_2042.jpg",
      evidence: "only 6 questions read",
      payload: { subject_code: "21CSC202J", subject: "OS", file: "Operating_Systems/07_PYQs/IMG_2042.jpg", meta: { kind: "end", test: "END", date: "2025-12" }, questions: [{ slot: "A1", marks: 1, topic: "paging" }], doubts: ["only 6 questions read"] },
    },
  });
  await page.goto("/");
  await expect(page.getByText("Past paper · OS End-sem, Dec 2025 · 1 question")).toBeVisible();
  await expect(page.getByText("Autopilot isn't sure: only 6 questions read.")).toBeVisible();
  await page.getByRole("button", { name: "Add to past papers" }).click();
  await expect(page.getByText("Your Mac adds it to the past papers at its next sync")).toBeVisible();
  const [s] = await serverRows<{ status: string }>(page.request, "suggestions", { key: "eq.paper:abc" });
  expect(s.status).toBe("accepted");
});
