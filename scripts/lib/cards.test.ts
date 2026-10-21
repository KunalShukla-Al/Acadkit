import { describe, expect, it } from "vitest";
import { checkCards } from "./cards.mjs";

const mcq = (extra: Record<string, unknown> = {}) => ({
  id: "d3acc1c88e7408bd",
  subject: "OS",
  code: "21CSC202J",
  deck: "1 FT-II · Units II–III",
  unit: 3,
  topic: "CPU scheduling",
  tier: "near-certain",
  repeated: true,
  question: "Throughput in scheduling means",
  options: [
    { key: "A", text: "Processes completed per unit time" },
    { key: "B", text: "CPU idle time" },
  ],
  answer: "A",
  why: "  ",
  seen: ["End-sem May 2024", " "],
  ...extra,
});

describe("checkCards", () => {
  it("keeps a good multiple-choice card, trimmed and with empty fields as null", () => {
    const { body, warnings } = checkCards({ version: 1, cards: [mcq()] });
    expect(warnings).toEqual([]);
    expect(body?.cards[0]).toMatchObject({ id: "d3acc1c88e7408bd", answer: "A", why: null, seen: ["End-sem May 2024"], repeated: true });
  });

  it("keeps a card to recall, with no options and a written answer", () => {
    const { body } = checkCards({ version: 1, cards: [mcq({ id: "recall1", options: [], answer: "Round robin" })] });
    expect(body?.cards[0]).toMatchObject({ options: [], answer: "Round robin" });
  });

  it("drops a card whose answer isn't one of its options, and keeps the rest", () => {
    const { body, warnings } = checkCards({ version: 1, cards: [mcq({ id: "bad", answer: "C" }), mcq()] });
    expect(body?.cards.map((c) => c.id)).toEqual(["d3acc1c88e7408bd"]);
    expect(warnings).toEqual(["card bad: a multiple-choice card needs two or more options, one of them its answer"]);
  });

  it("drops a repeated id, so one review can't count for two cards", () => {
    const { body, warnings } = checkCards({ version: 1, cards: [mcq(), mcq({ question: "Another" })] });
    expect(body?.cards).toHaveLength(1);
    expect(warnings[0]).toMatch(/id used twice/);
  });

  it("drops a card with two options under one letter", () => {
    const options = [{ key: "A", text: "x" }, { key: "A", text: "y" }];
    expect(checkCards({ version: 1, cards: [mcq({ options })] }).body).toBeNull();
  });

  it("sends nothing when no card survives", () => {
    const { body, warnings } = checkCards({ version: 1, cards: [{ id: "x" }] });
    expect(body).toBeNull();
    expect(warnings).toContain("no usable cards");
  });

  it("refuses a file without a cards list", () => {
    expect(checkCards({ version: 1 }).body).toBeNull();
  });
});
