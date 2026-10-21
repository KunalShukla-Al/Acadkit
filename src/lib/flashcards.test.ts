import { describe, expect, it } from "vitest";
import {
  answerText,
  BOX_DAYS,
  type CardReview,
  type Flashcard,
  nextReview,
  requeue,
  studyQueue,
  subjectsOf,
  waitingCount,
} from "@/lib/flashcards";

const card = (id: string, subject = "OS", extra: Partial<Flashcard> = {}): Flashcard => ({
  id,
  subject,
  code: null,
  deck: null,
  unit: null,
  topic: null,
  tier: null,
  repeated: false,
  question: `Question ${id}`,
  options: [],
  answer: `Answer ${id}`,
  why: null,
  seen: [],
  ...extra,
});

const reviewed = (card_id: string, box: number, due: string): CardReview => ({ card_id, box, due, reviewed_at: "2026-10-18T10:00:00Z" });
const byId = (rs: CardReview[]) => new Map(rs.map((r) => [r.card_id, r]));

describe("nextReview", () => {
  it("moves a known new card into box 1, due tomorrow", () => {
    expect(nextReview(undefined, true, "2026-10-18")).toEqual({ box: 1, due: "2026-10-19" });
  });

  it("moves a known card up one box, waiting that box's days", () => {
    expect(nextReview({ box: 2 }, true, "2026-10-18")).toEqual({ box: 3, due: "2026-10-25" });
  });

  it("keeps a card in the last box once it gets there, a month apart", () => {
    expect(nextReview({ box: 5 }, true, "2026-10-18")).toEqual({ box: 5, due: "2026-11-17" });
    expect(BOX_DAYS[BOX_DAYS.length - 1]).toBe(30);
  });

  it("sends a missed card back to box 1, due again today", () => {
    expect(nextReview({ box: 4 }, false, "2026-10-18")).toEqual({ box: 1, due: "2026-10-18" });
  });
});

describe("studyQueue", () => {
  const cards = [card("a"), card("b"), card("c", "DSA"), card("d"), card("e")];

  it("puts due cards first, most overdue first, then new cards in the deck's order", () => {
    const reviews = byId([reviewed("d", 2, "2026-10-17"), reviewed("b", 1, "2026-10-15"), reviewed("e", 3, "2026-10-30")]);
    expect(studyQueue(cards, reviews, "2026-10-18").map((c) => c.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("brings in only so many new cards at a time", () => {
    expect(studyQueue(cards, new Map(), "2026-10-18", { newLimit: 2 }).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("keeps to one subject when asked", () => {
    expect(studyQueue(cards, new Map(), "2026-10-18", { subject: "DSA" }).map((c) => c.id)).toEqual(["c"]);
  });

  it("counts what's waiting for the badge", () => {
    expect(waitingCount(cards, byId([reviewed("a", 2, "2026-10-30")]), "2026-10-18")).toBe(4);
  });
});

describe("helpers", () => {
  it("says a multiple-choice answer in words", () => {
    const mcq = card("m", "OS", { options: [{ key: "A", text: "Throughput" }, { key: "B", text: "Latency" }], answer: "B" });
    expect(answerText(mcq)).toBe("Latency");
    expect(answerText(card("r"))).toBe("Answer r");
  });

  it("lists subjects in first-seen order", () => {
    expect(subjectsOf([card("a", "OS"), card("b", "TBVP"), card("c", "OS")])).toEqual(["OS", "TBVP"]);
  });

  it("puts a missed card back a few places on, or last when few are left", () => {
    expect(requeue([1, 2, 3, 4, 5, 6], 9)).toEqual([1, 2, 3, 4, 9, 5, 6]);
    expect(requeue([1, 2], 9)).toEqual([1, 2, 9]);
  });
});
