import type { APIRequestContext } from "@playwright/test";
import { expect, MOCK_API, test } from "./fixtures";

// What links to what (scripts/lib/links.mjs), as the sync sends it: an index and a course's part.
const STORAGE = MOCK_API.replace("/rest/v1", "/storage/v1/object/study-files/1234");
const NOTES = "Operating_Systems/Unit 2 scheduling notes.pdf";
const LECTURE = "00001234-0000-4000-8000-000000000000";
const MEMO = "20261007 080200-A.m4a";
const PART = {
  course: "Operating_Systems",
  links: {
    [`page:${NOTES}#1`]: [
      { id: `moment:${MEMO}#3`, kind: "moment", why: "meaning", score: 0.41 },
      { id: "question:os-es-2025-12#B21", kind: "question", why: "meaning", score: 0.33 },
      { id: "page:Operating_Systems/Unit 3 deadlocks (6 pages).pdf#2", kind: "page", why: "meaning", score: 0.3 },
    ],
    [`moment:${MEMO}#3`]: [
      { id: "slide:Operating_Systems/02_Notes/Unit_3/CPU.pptx#24", kind: "slide", why: "time" },
      { id: `page:${NOTES}#1`, kind: "page", why: "meaning", score: 0.41 },
    ],
  },
  questions: { "question:os-es-2025-12#B21": { path: "Operating_Systems/07_PYQs/es-2025-12.pdf", label: "End-sem Dec 2025 · B21", text: "Explain round robin scheduling." } },
  moments: { [`moment:${MEMO}#3`]: { at: "2026-10-07T08:05" } },
};

async function seed(request: APIRequestContext) {
  const file = "links/Operating_Systems-0123456789ab.json";
  await request.post(`${STORAGE}/${file}`, { data: PART });
  await request.post(`${STORAGE}/links.json`, { data: { version: 1, generatedAt: 1, courses: [{ course: "Operating_Systems", items: 2, file }] } });
  await request.post(`${MOCK_API}/lectures`, {
    data: { id: LECTURE, device_id: "1234", memo: MEMO, date: "2026-10-07", start_time: "08:02:00", seconds: 2880, subject_code: "21CSC202J", deck: "Operating_Systems/02_Notes/Unit_3/CPU.pptx", words: 4200 },
  });
  await request.post(`${MOCK_API}/lecture_moments`, {
    data: [3].map((idx) => ({ device_id: "1234", lecture_id: LECTURE, idx, start_s: 180, end_s: 240, content: "Round robin gives each process a time quantum.", page: 24 })),
  });
}

test("a page of notes says what links to it: class, papers, other notes", async ({ signedIn: page }) => {
  await seed(page.request);
  await page.goto(`/view?${new URLSearchParams({ path: NOTES })}`);
  const line = page.getByLabel("Connected");
  await expect(line).toBeVisible();
  await expect(line.getByText(/^(Lecture 7 Oct, 08:05|End-sem Dec 2025 · B21|p\. 2 · Unit 3 deadlocks \(6 pages\))$/)).toHaveCount(3);

  // Each chip opens its item: the moment in its transcript, and Back returns to the page.
  await line.getByRole("link", { name: "Lecture 7 Oct, 08:05" }).click();
  await expect(page).toHaveURL(new RegExp(`/lecture/${LECTURE}\\?m=3$`));
  await expect(page.locator("p", { hasText: "Round robin gives each process" })).toHaveClass(/bg-accent/);
  // The transcript opened over the viewer: its own Back returns there.
  await page.getByRole("banner").filter({ hasText: "OS lecture" }).getByLabel("Back").click();
  await expect(page).toHaveURL(/\/view\?path=/);
  await expect(line.getByRole("link", { name: "End-sem Dec 2025 · B21" })).toHaveAttribute("href", `/view?${new URLSearchParams({ path: "Operating_Systems/07_PYQs/es-2025-12.pdf" })}`);
});

test("a lecture moment says what links to it, but not the slide its run already names", async ({ signedIn: page }) => {
  await seed(page.request);
  await page.goto(`/lecture/${LECTURE}`);
  const line = page.getByLabel("Connected");
  await expect(line).toContainText("p. 1 · Unit 2 scheduling notes");
  await expect(line).not.toContainText("Slide 24");
  await line.getByRole("link", { name: "p. 1 · Unit 2 scheduling notes" }).click();
  await expect(page).toHaveURL(`/view?${new URLSearchParams({ path: NOTES, page: "1" })}`);
});

test("a past-paper question on Practice says what links to it, matched by its paper and words", async ({ signedIn: page }) => {
  await seed(page.request);
  // Past-paper topics as the sync sends them: an index and the subject's part.
  const topic = {
    label: "Round robin scheduling",
    example: "Explain round robin scheduling.",
    asked: [{ text: "Explain the round robin scheduling algorithm", path: "Operating_Systems/07_PYQs/es-2025-12.pdf", year: 2025, group: "End_Sem" }],
    papers: 2,
    questions: 2,
    latest: 2025,
    groups: { End_Sem: 2 },
  };
  const file = "topics/21CSC202J-0123456789ab.json";
  await page.request.post(`${STORAGE}/${file}`, { data: { subject_code: "21CSC202J", papers: 12, questions: 300, groups: {}, topics: [topic] } });
  await page.request.post(`${STORAGE}/topics.json`, { data: { version: 2, generatedAt: 1, model: "gte-small", subjects: [{ subject_code: "21CSC202J", papers: 12, questions: 300, file }] } });
  // The question links back to the page of notes.
  const part = { ...PART, links: { ...PART.links, "question:os-es-2025-12#B21": [{ id: `page:${NOTES}#1`, kind: "page", why: "meaning", score: 0.45 }] } };
  await page.request.post(`${STORAGE}/links/Operating_Systems-0123456789ab.json`, { data: part });

  await page.goto("/practice/21CSC202J");
  await page.getByRole("button", { name: /Round robin scheduling/ }).click();
  const line = page.getByLabel("Connected");
  await expect(line.getByRole("link", { name: "p. 1 · Unit 2 scheduling notes" })).toBeVisible();
  await line.getByRole("link", { name: "p. 1 · Unit 2 scheduling notes" }).click();
  await expect(page).toHaveURL(`/view?${new URLSearchParams({ path: NOTES, page: "1" })}`);
});

test("a board photo says what links to it", async ({ signedIn: page }) => {
  const PHOTO = "Operating_Systems/Board 7 Oct.jpg";
  // A photo in the manifest (its bytes don't matter here: the line comes from the links).
  const manifest = await (await page.request.get(`${STORAGE}/manifest.json`)).json();
  manifest.files.push({ ...manifest.files.find((f: { path: string }) => f.path === NOTES), path: PHOTO, kind: "other" });
  await page.request.post(`${STORAGE}/manifest.json`, { data: manifest });
  const file = "links/Operating_Systems-0123456789ab.json";
  await page.request.post(`${STORAGE}/${file}`, {
    data: { course: "Operating_Systems", links: { [`photo:${PHOTO}`]: [{ id: `page:${NOTES}#1`, kind: "page", why: "meaning", score: 0.5 }] }, questions: {}, moments: {} },
  });
  await page.request.post(`${STORAGE}/links.json`, { data: { version: 1, generatedAt: 1, courses: [{ course: "Operating_Systems", items: 1, file }] } });

  await page.goto(`/view?${new URLSearchParams({ path: PHOTO })}`);
  const line = page.getByLabel("Connected");
  await expect(line).toBeVisible();
  await expect(line.getByRole("link", { name: /Unit 2 scheduling notes/ })).toHaveAttribute("href", `/view?${new URLSearchParams({ path: NOTES, page: "1" })}`);
});
