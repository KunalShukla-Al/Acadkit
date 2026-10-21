import type { APIRequestContext } from "@playwright/test";
import { expect, MOCK_API, test } from "./fixtures";

// A lecture the Mac recorded, transcribed and lined up with its slides (migration 061).
const LECTURE = "00001234-0000-4000-8000-000000000000";
const DECK = "Operating_Systems/02_Notes/Unit_3/Unit3_CPU_Scheduling_Slides.pptx";
const moment = (idx: number, page: number | null, content: string) => ({
  device_id: "1234", lecture_id: LECTURE, idx, start_s: idx * 60, end_s: idx * 60 + 60, content, page, similarity: page ? 0.9 : null,
});

async function seed(request: APIRequestContext) {
  await request.post(`${MOCK_API}/lectures`, {
    data: {
      id: LECTURE, device_id: "1234", memo: "20261007 080200-A.m4a", date: "2026-10-07", start_time: "08:02:00", seconds: 2880,
      subject_code: "21CSC202J", class_start: "08:00", class_end: "08:50", deck: DECK, words: 4200,
    },
  });
  await request.post(`${MOCK_API}/lecture_moments`, {
    data: [
      moment(0, 23, "First come first served runs processes in the order they arrive."),
      moment(1, 23, "Its average waiting time can be long when a long job comes first."),
      moment(2, null, "Sign the attendance sheet before you leave."),
      moment(3, 24, "Round robin gives each process a time quantum, then preempts it."),
    ],
  });
}

test("a subject lists its recorded lectures, and one opens as its transcript by slide", async ({ signedIn: page }) => {
  await seed(page.request);
  await page.goto("/subject/21CSC202J");
  await expect(page.getByText("Recorded lectures · 1")).toBeVisible();
  await page.getByRole("link", { name: /Wed,? 7 Oct, 08:02 · 48 min/ }).click();

  await expect(page).toHaveURL(new RegExp(`/lecture/${LECTURE}$`));
  await expect(page.getByText("OS lecture", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Wed,? 7 Oct · 08:02 · 48 min · Unit3_CPU_Scheduling_Slides\.pptx$/)).toBeVisible();
  const slides = page.getByRole("link", { name: /^Slide \d+$/ });
  await expect(slides).toHaveText(["Slide 23", "Slide 24"]);
  await expect(page.getByText("Off the slides")).toBeVisible();
  await expect(page.locator("p", { hasText: "Round robin gives each process a time quantum" })).toContainText("08:05");

  // A slide opens the viewer at its page, and Back returns to the transcript.
  await expect(slides.first()).toHaveAttribute("href", `/view?${new URLSearchParams({ path: DECK, page: "23" })}`);
  await slides.first().click();
  await expect(page).toHaveURL(/\/view\?path=.*&page=23$/);
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("OS lecture", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/subject\/21CSC202J$/);
});

test("a lecture that isn't there says so", async ({ signedIn: page }) => {
  await page.goto(`/lecture/${LECTURE}`);
  await expect(page.getByText("This lecture isn't here any more.")).toBeVisible();
});

test("a search finds what was said in class, and opens the transcript there", async ({ signedIn: page }) => {
  await seed(page.request);
  await page.goto("/files");
  const search = page.getByRole("textbox", { name: "Search files" });
  await search.fill("round robin quantum");
  await search.press("Enter");
  const hit = page.getByRole("link", { name: /OS lecture · Wed,? 7 Oct, 08:05/ });
  await expect(hit).toBeVisible();
  await expect(hit).toContainText("Slide 24 of Unit3_CPU_Scheduling_Slides.pptx");
  // The aside shares no word with the query, so it stays out.
  await expect(page.getByText("Sign the attendance sheet")).toHaveCount(0);
  await hit.click();
  await expect(page).toHaveURL(new RegExp(`/lecture/${LECTURE}\\?m=3$`));
  await expect(page.locator("p", { hasText: "Round robin gives each process" })).toHaveClass(/bg-accent/);
});
