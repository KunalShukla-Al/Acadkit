/**
 * Links between the items of the embedding space (scripts/lib/connected.mjs):
 * each item points at the items of other kinds in its course that are about
 * the same thing, the nearest two of each kind, centered on the course's
 * mean (scripts/lib/decks.mjs), and only above a bar checked for that pair
 * of kinds (BARS).
 */
import { centerOn } from "./decks.mjs";
import { contentPart } from "./parts.mjs";

/**
 * The bar for each pair of kinds, on centered similarity: 0.40, from 100
 * links judged by reading both ends (EVAL.md). Of those at 0.40 or more,
 * 82% were right; under it, 10 of 33. A fresh sample of the links shown,
 * judged after, came out at 73%. Agreeing on the unit was a weaker
 * check (`npm run connected -- --check`): 80% of question links agree on
 * it from 0.23 for slides and 0.26 for pages, where most links were wrong.
 * Photos and pairs without judged links take the same bar.
 */
export const BARS = {
  "page|question": 0.4,
  "question|slide": 0.4,
  "page|slide": 0.4,
};
export const barFor = (a, b, bars = BARS) => bars[[a, b].sort().join("|")] ?? Math.max(...Object.values(bars));

/** Each item's vector centered on its course's mean, as a Float32Array for speed. */
function centered(items, means) {
  const by = new Map(Object.entries(means).map(([course, mean]) => [course, centerOn(mean)]));
  return items.map((i) => Float32Array.from(by.get(i.course)?.(i.vector) ?? i.vector));
}

const dot = (a, b) => {
  let s = 0;
  for (let k = 0; k < a.length; k++) s += a[k] * b[k];
  return s;
};

/**
 * Links by meaning: id → [{ id, kind, score }], best first, at most `perKind`
 * of each other kind, all from the item's own course and over the pair's bar.
 */
export function linkByMeaning(items, means, { bars = BARS, perKind = 2 } = {}) {
  const vectors = centered(items, means);
  const byCourse = new Map();
  items.forEach((item, i) => {
    if (!item.course) return;
    const list = byCourse.get(item.course) ?? [];
    list.push(i);
    byCourse.set(item.course, list);
  });
  const links = {};
  for (const list of byCourse.values()) {
    for (const i of list) {
      const best = {};
      for (const j of list) {
        if (items[j].kind === items[i].kind) continue;
        const score = dot(vectors[i], vectors[j]);
        if (score < barFor(items[i].kind, items[j].kind, bars)) continue;
        const kept = (best[items[j].kind] ??= []);
        if (kept.length < perKind || score > kept[kept.length - 1].score) {
          kept.push({ id: items[j].id, kind: items[j].kind, why: "meaning", score: Math.round(score * 1000) / 1000 });
          kept.sort((a, b) => b.score - a.score);
          if (kept.length > perKind) kept.pop();
        }
      }
      const out = Object.values(best).flat().sort((a, b) => b.score - a.score);
      if (out.length) links[items[i].id] = out;
    }
  }
  return links;
}

/**
 * A bar checked against labels: given scored pairs { score, right }, the
 * lowest bar at which at least `precision` of the pairs above it are right,
 * with at least `min` of them. Returns { bar, precision, pairs } or null.
 */
export function checkBar(pairs, { precision = 0.8, min = 20 } = {}) {
  const sorted = [...pairs].sort((a, b) => b.score - a.score);
  let right = 0;
  let found = null;
  sorted.forEach((p, n) => {
    if (p.right) right++;
    const share = right / (n + 1);
    if (n + 1 >= min && share >= precision) found = { bar: Math.round(p.score * 100) / 100, precision: Math.round(share * 100) / 100, pairs: n + 1 };
  });
  return found;
}

/**
 * Every question-page and question-slide pair in a course with a unit on
 * both sides, scored and marked right when the units agree: what the
 * question-page and question-slide bars are checked against.
 */
export function unitPairs(items, means, kinds = ["page", "slide"]) {
  const vectors = centered(items, means);
  const pairs = [];
  items.forEach((q, i) => {
    if (q.kind !== "question" || !q.unit) return;
    items.forEach((p, j) => {
      if (!kinds.includes(p.kind) || p.course !== q.course || !p.unit) return;
      pairs.push({ kind: p.kind, score: dot(vectors[i], vectors[j]), right: p.unit === q.unit });
    });
  });
  return pairs;
}

/**
 * Links as the app loads them (<pin>/links.json, written by the sync): an
 * index, and a part per course named by its content (scripts/lib/parts.mjs),
 * so the app fetches only the course it shows and keeps every part it has.
 * Scores keep two places; vectors stay on the Mac. A part also says what
 * the app can't work out from an id: each question's paper file, label and
 * text.
 */
export function splitLinks(links, items, generatedAt = Date.now()) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const by = new Map();
  for (const [id, list] of Object.entries(links)) {
    const course = byId.get(id)?.course;
    if (!course) continue;
    const part = by.get(course) ?? {};
    part[id] = list.map((l) => ({ id: l.id, kind: l.kind, why: l.why, ...(l.score !== undefined ? { score: Math.round(l.score * 100) / 100 } : {}) }));
    by.set(course, part);
  }
  const about = (part) => {
    const questions = {};
    for (const id of new Set(Object.entries(part).flatMap(([from, list]) => [from, ...list.map((l) => l.id)]))) {
      const item = byId.get(id);
      if (item?.kind === "question") questions[id] = { path: item.ref.path, label: item.ref.label, text: item.ref.text };
    }
    return { questions };
  };
  const courses = [...by.keys()].sort();
  const parts = courses.map((course) => contentPart("links", course, { course, links: by.get(course), ...about(by.get(course)) }));
  const index = {
    version: 1,
    generatedAt,
    courses: courses.map((course, i) => ({ course, items: Object.keys(by.get(course)).length, file: parts[i].name })),
  };
  return { index, parts };
}
