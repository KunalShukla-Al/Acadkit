/**
 * Flashcards: the past-paper MCQs and short questions, read from the study
 * folder's _src/acadkit_cards.json and sent on as <pin>/cards.json for the
 * flashcard deck.
 *
 * {
 *   version: 1,
 *   cards: [{ id, subject, code, deck, unit, topic, tier, repeated,
 *             question, options: [{ key, text }], answer, why, seen }]
 * }
 *
 * The file's order is the order new cards are shown in. A card with options
 * is a multiple-choice card, and its answer is one of their keys; a card
 * without is one to recall, and its answer is the text. One bad card is
 * dropped with a warning and never hides the rest. Reviews are stored under
 * a card's id (migration 045), so a repeated id is dropped rather than
 * letting one review count for two cards.
 */

const ID = /^[A-Za-z0-9][A-Za-z0-9#:._-]{0,79}$/;
const KEY = /^[A-H]$/;
const TIERS = new Set(["near-certain", "likely", "possible", "rare"]);

const text = (s) => (typeof s === "string" ? s.trim() : "");
const texts = (a) => (Array.isArray(a) ? a.map(text).filter(Boolean) : []);

function options(list, what, warnings) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const out = [];
  for (const o of list) {
    const key = text(o?.key);
    const body = text(o?.text);
    if (!KEY.test(key) || !body || out.some((x) => x.key === key)) {
      warnings.push(`${what}: an option needs a letter of its own and some text`);
      return null;
    }
    out.push({ key, text: body });
  }
  return out;
}

/** Check a cards file. Returns { body, warnings }; body is null when nothing usable is left. */
export function checkCards(data) {
  const warnings = [];
  if (data?.version !== 1) warnings.push(`version should be 1, read as 1`);
  if (!Array.isArray(data?.cards)) return { body: null, warnings: [...warnings, `needs a "cards" list`] };

  const cards = [];
  const ids = new Set();
  for (const [i, c] of data.cards.entries()) {
    const id = text(c?.id);
    const what = `card ${id || i + 1}`;
    const question = text(c?.question);
    const answer = text(c?.answer);
    if (!ID.test(id) || !question || !answer || !text(c?.subject)) {
      warnings.push(`${what}: needs an id, a subject, a question and an answer`);
      continue;
    }
    if (ids.has(id)) {
      warnings.push(`${what}: id used twice, the second one dropped`);
      continue;
    }
    const opts = options(c.options, what, warnings);
    if (opts === null) continue;
    if (opts.length === 1 || (opts.length && !opts.some((o) => o.key === answer))) {
      warnings.push(`${what}: a multiple-choice card needs two or more options, one of them its answer`);
      continue;
    }
    ids.add(id);
    cards.push({
      id,
      subject: text(c.subject),
      code: text(c.code) || null,
      deck: text(c.deck) || null,
      unit: Number.isInteger(c.unit) && c.unit >= 1 && c.unit <= 10 ? c.unit : null,
      topic: text(c.topic) || null,
      tier: TIERS.has(c.tier) ? c.tier : null,
      repeated: c.repeated === true,
      question,
      options: opts,
      answer,
      why: text(c.why) || null,
      seen: texts(c.seen),
    });
  }
  return {
    body: cards.length ? { version: 1, generatedAt: Date.now(), cards } : null,
    warnings: cards.length ? warnings : [...warnings, "no usable cards"],
  };
}
