import AxeBuilder from "@axe-core/playwright";
import { expect, serverRows, test, waitForLaunch } from "./fixtures";

// The cards are e2e/study-fixture/_src/acadkit_cards.json, checked by the mock as the sync checks
// them: two OS cards (one to choose, one to recall) and a DSA card. The clock is Wed 7 Oct 2026.
// Reduced motion, so a thrown card is graded at once instead of after its flight.
test.use({ reducedMotion: "reduce" });

type Review = { card_id: string; box: number; due: string };
/** The corner's Flashcards, which opens the deck. */
async function openDeck(page: Parameters<typeof waitForLaunch>[0]) {
  await page.getByRole("button", { name: /More: calendar/ }).click();
  await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: /flashcards/i }).click();
}
const reviews = async (request: Parameters<typeof serverRows>[0]) =>
  (await serverRows<Review>(request, "card_reviews")).map((r) => [r.card_id, r.box, r.due]);

test("the corner opens the deck, counting the cards waiting; picking an answer flips the card and the grade is saved", async ({ signedIn: page, request }) => {
  await page.getByRole("button", { name: /More: calendar/ }).click();
  const item = page.getByRole("dialog", { name: "More" }).getByRole("button", { name: /flashcards/i });
  await expect(item).toHaveText(/^3\s*flashcards$/i);
  await item.click();

  const deck = page.getByRole("dialog", { name: "Flashcards" });
  await expect(deck.getByText("1 of 3")).toBeVisible();
  await expect(deck.getByText("Throughput in scheduling means")).toBeVisible();
  await deck.getByRole("button", { name: /^A The number of processes completed per unit time$/ }).click();
  await expect(deck.getByText("You got it.")).toBeVisible();
  await expect(deck.getByText("Asked in End-sem May 2024 · FJ2 2024 (set pink)")).toBeVisible();

  await deck.getByRole("button", { name: "Got it" }).click();
  await expect.poll(() => reviews(request)).toEqual([["c-throughput", 1, "2026-10-08"]]);
  await expect(deck.getByText("2 of 3")).toBeVisible();
});

test("a card to recall: show the answer, then Again brings it round once more", async ({ signedIn: page, request }) => {
  await openDeck(page);
  const deck = page.getByRole("dialog", { name: "Flashcards" });
  await expect(deck.getByText("Throughput in scheduling means")).toBeVisible();
  await page.keyboard.press("1");
  await deck.getByRole("button", { name: "Got it" }).click();

  await expect(deck.getByText(/Which module gives control of the CPU/)).toBeVisible();
  await deck.getByRole("button", { name: "Show answer" }).click();
  await expect(deck.getByText("The dispatcher", { exact: true })).toBeVisible();
  await deck.getByRole("button", { name: "Again" }).click();
  // Missed: due again today, and back at the end of this sitting.
  await expect.poll(() => reviews(request)).toContainEqual(["c-dispatcher", 1, "2026-10-07"]);
  await expect(deck.getByText("3 of 4")).toBeVisible();
});

test("a wrong pick says so, and the keyboard grades too", async ({ signedIn: page, request }) => {
  await openDeck(page);
  const deck = page.getByRole("dialog", { name: "Flashcards" });
  await deck.getByRole("tab", { name: "DSA" }).click();
  await expect(deck.getByText("A queue removes items in which order?")).toBeVisible();
  await deck.getByRole("button", { name: /^A Last in, first out$/ }).click();
  await expect(deck.getByText("You picked A.")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => reviews(request)).toEqual([["c-queue", 1, "2026-10-07"]]);
});

test("Escape closes the deck and puts focus back on the corner", async ({ signedIn: page }) => {
  await openDeck(page);
  await expect(page.getByRole("dialog", { name: "Flashcards" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Flashcards" })).toBeHidden();
  await expect(page.getByRole("button", { name: /More: calendar/ })).toBeFocused();
});

test("before any cards have synced, the corner counts none", async ({ page }) => {
  await page.route("**/study-files/1234/cards.json", (route) =>
    route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ statusCode: "404", error: "not_found", message: "Object not found" }) })
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await page.getByLabel("Email").fill("e2e@acadkit.test");
  await page.getByLabel("Password").fill("e2e-password");
  await page.locator("form").getByRole("button").click();
  await expect(page.getByRole("heading", { name: /Wednesday, 7 October/ })).toBeVisible();
  await page.getByRole("button", { name: /More: calendar/ }).click();
  await expect(page.getByRole("dialog", { name: "More" }).getByRole("button", { name: /flashcards/i })).toHaveText(/^flashcards$/i);
});

for (const scheme of ["light", "dark"] as const) {
  test(`the open deck passes axe in ${scheme} mode`, async ({ signedIn: page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await waitForLaunch(page);
    await openDeck(page);
    const deck = page.getByRole("dialog", { name: "Flashcards" });
    await expect(deck.getByText("Throughput in scheduling means")).toBeVisible();
    await page.waitForTimeout(400);
    const { violations } = await new AxeBuilder({ page }).include("[data-flashcard-deck]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}
