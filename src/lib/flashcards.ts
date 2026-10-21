import { addDays } from "@acadkit/core/dates";

/**
 * Flashcards: past-paper MCQs and short questions, written in the study
 * folder (_src/acadkit_cards.json), checked by the sync
 * (scripts/lib/cards.mjs) and read here as <pin>/cards.json. Where each
 * card stands lives apart from it, in card_reviews (migration 045), keyed
 * by the card's id, so the deck can be rebuilt without losing it.
 *
 * Scheduling is a Leitner system: five boxes, each waiting longer than
 * the last. Knowing a card moves it up a box; missing it puts it back in
 * box 1, due again today.
 */

export interface CardOption {
  key: string;
  text: string;
}

export interface Flashcard {
  id: string;
  /** Short subject name, e.g. "OS". */
  subject: string;
  code: string | null;
  /** The test the card is for, e.g. "1 FT-II · Units II–III". */
  deck: string | null;
  unit: number | null;
  topic: string | null;
  tier: "near-certain" | "likely" | "possible" | "rare" | null;
  /** Came back in two or more past papers. */
  repeated: boolean;
  question: string;
  /** Empty for a card to recall rather than choose. */
  options: CardOption[];
  /** An option's key for a multiple-choice card, the written answer otherwise. */
  answer: string;
  why: string | null;
  /** The papers that asked it. */
  seen: string[];
}

export interface CardsData {
  version: 1;
  generatedAt: number;
  cards: Flashcard[];
}

export interface CardReview {
  card_id: string;
  box: number;
  /** "YYYY-MM-DD": the card is due on and after this day. */
  due: string;
  reviewed_at: string;
}

/** Days until a card in each box is due again: box 1 waits a day, box 5 a month. */
export const BOX_DAYS = [1, 3, 7, 14, 30] as const;
export const MAX_BOX = BOX_DAYS.length;

/** New cards one sitting brings in, so a deck of hundreds doesn't arrive at once. */
export const NEW_PER_SESSION = 20;

export function isChoice(card: Flashcard): boolean {
  return card.options.length > 0;
}

/** The answer in words: the right option's text for a multiple-choice card. */
export function answerText(card: Flashcard): string {
  return card.options.find((o) => o.key === card.answer)?.text ?? card.answer;
}

/** Where a card goes after a review: up a box when you knew it, back to box 1 (due today) when you didn't. */
export function nextReview(prev: Pick<CardReview, "box"> | undefined, knew: boolean, today: string): { box: number; due: string } {
  if (!knew) return { box: 1, due: today };
  const box = Math.min((prev?.box ?? 0) + 1, MAX_BOX);
  return { box, due: addDays(today, BOX_DAYS[box - 1]) };
}

export interface QueueOptions {
  /** Only this subject's cards, or every subject when null. */
  subject?: string | null;
  newLimit?: number;
}

/**
 * What to study now: the cards that are due, most overdue first, then up
 * to `newLimit` cards never seen, in the deck's own order (which puts the
 * questions that came back in past papers first).
 */
export function studyQueue(
  cards: Flashcard[],
  reviews: ReadonlyMap<string, CardReview>,
  today: string,
  { subject = null, newLimit = NEW_PER_SESSION }: QueueOptions = {}
): Flashcard[] {
  const pool = subject ? cards.filter((c) => c.subject === subject) : cards;
  const due = pool
    .filter((c) => {
      const r = reviews.get(c.id);
      return r !== undefined && r.due <= today;
    })
    .sort((a, b) => reviews.get(a.id)!.due.localeCompare(reviews.get(b.id)!.due));
  const fresh = pool.filter((c) => !reviews.has(c.id)).slice(0, newLimit);
  return [...due, ...fresh];
}

/** How many cards wait for you now, for the cards line on Today and Study. */
export function waitingCount(cards: Flashcard[], reviews: ReadonlyMap<string, CardReview>, today: string): number {
  return studyQueue(cards, reviews, today).length;
}

/** The subjects in the deck, in the order they first appear. */
export function subjectsOf(cards: Flashcard[]): string[] {
  return [...new Set(cards.map((c) => c.subject))];
}

/**
 * Put a missed card back into the session a few cards later, so it comes
 * round again while it's fresh. It goes to the end when fewer are left.
 */
export function requeue<T>(queue: T[], card: T, gap = 4): T[] {
  const at = Math.min(gap, queue.length);
  return [...queue.slice(0, at), card, ...queue.slice(at)];
}
