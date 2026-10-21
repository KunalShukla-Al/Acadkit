/**
 * Judging links by meaning (scripts/connected-judge.mjs): which links to
 * judge, and EVAL.md's section on how many were right.
 */

/** Links to judge for each pair of kinds: most for the question pairs, which Practice shows. */
export const QUOTAS = { "question|slide": 40, "page|question": 30, "page|slide": 30 };

/** A small seeded random (mulberry32), so a sample is the same each time. */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Links drawn to judge: each pair once (a link and its reverse are one),
 * `QUOTAS` of each pair of kinds, scaled to `total`, at random but the
 * same each time, leaving out pairs in `exclude` ("from\tto", judged
 * before). Returns [{ from, to, pair, score }].
 */
export function sampleLinks(links, items, { total = 100, seed = 2026, quotas = QUOTAS, exclude = new Set() } = {}) {
  const kindOf = new Map(items.map((i) => [i.id, i.kind]));
  const pairs = new Map();
  for (const [from, list] of Object.entries(links))
    for (const l of list) {
      if (l.why !== "meaning") continue;
      const [a, b] = [from, l.id].sort();
      const pair = [kindOf.get(a), kindOf.get(b)].sort().join("|");
      if (!(pair in quotas) || exclude.has(`${a}\t${b}`)) continue;
      pairs.set(`${a}\t${b}`, { from: a, to: b, pair, score: l.score });
    }
  const scale = total / Object.values(quotas).reduce((n, q) => n + q, 0);
  const next = random(seed);
  const out = [];
  for (const [pair, quota] of Object.entries(quotas)) {
    const pool = [...pairs.values()].filter((p) => p.pair === pair).sort((x, y) => (x.from + x.to).localeCompare(y.from + y.to));
    for (let n = Math.round(quota * scale); n > 0 && pool.length; n--) out.push(pool.splice(Math.floor(next() * pool.length), 1)[0]);
  }
  return out;
}

/** A share's 95% interval (Wilson), as "62–80%". */
export function interval(right, n) {
  if (!n) return "-";
  const z = 1.96;
  const p = right / n;
  const mid = (p + (z * z) / (2 * n)) / (1 + (z * z) / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
  return `${Math.round(Math.max(0, mid - half) * 100)}–${Math.round(Math.min(1, mid + half) * 100)}%`;
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "-");
const NAMES = { "question|slide": "Question and slide", "page|question": "Question and page of notes", "page|slide": "Page of notes and slide" };
const BANDS = [
  ["under 0.30", (s) => s < 0.3],
  ["0.30 to 0.40", (s) => s >= 0.3 && s < 0.4],
  ["0.40 and over", (s) => s >= 0.4],
];

/** EVAL.md's section: precision of the judged links, overall, by pair of kinds and by score. */
export function judgedReport(judged, { date }) {
  const row = (name, list) => `| ${name} | ${list.length} | ${list.filter((j) => j.right).length} | ${pct(list.filter((j) => j.right).length, list.length)} | ${interval(list.filter((j) => j.right).length, list.length)} |`;
  const head = ["| | Links | Right | Precision | 95% interval |", "| --- | --- | --- | --- | --- |"];
  return [
    "## Everything connected: links by meaning",
    "",
    `${judged.length} links by meaning, drawn at random from my Sem 3 folder's links at bars of 0.23 to 0.26 (\`npm run connected:judge\`)`,
    `and judged on ${date}: right when the linked item covers the concept the other is about, not just the same unit, so that`,
    "following the link helps with what you were reading. The verdicts are in `eval/connected-links.tsv`. They were judged by",
    "Claude, the assistant that built this, reading both items' text, not by me; a spot check of my own is still to do.",
    "",
    ...head,
    row("All", judged),
    ...Object.keys(NAMES).map((pair) => row(NAMES[pair], judged.filter((j) => j.pair === pair))),
    "",
    "### By how alike they are (centered)",
    "",
    ...head,
    ...BANDS.map(([name, test]) => row(name, judged.filter((j) => test(j.score)))),
    "",
    "- From this check, every link by meaning needs 0.40 (\`BARS\` in `scripts/lib/links.mjs`). The 82% at that bar is measured on the",
    "  same links that chose it, so a fresh sample will likely come out a little lower.",
    "- Most wrong links share a unit but not the concept (a B-tree deletion for an AVL deletion), and some are slides with",
    "  nothing to say: a deck's title, a syllabus's book list, handwriting the OCR couldn't read.",
    "",
  ].join("\n");
}

/** EVAL.md's section on a fresh sample of the links the app shows, judged after the bar was set. */
export function freshReport(judged, { date, before }) {
  const right = judged.filter((j) => j.right).length;
  const row = (name, list) => `| ${name} | ${list.length} | ${list.filter((j) => j.right).length} | ${pct(list.filter((j) => j.right).length, list.length)} | ${interval(list.filter((j) => j.right).length, list.length)} |`;
  return [
    "## Everything connected: the links the app shows",
    "",
    `${judged.length} more links by meaning, drawn at random from the links the app shows now (every pair at 0.40, at most two`,
    `of each kind under an item), none of them among the 100 above, and judged the same way on ${date}. The verdicts are in`,
    "`eval/connected-links-fresh.tsv`, judged by Claude as well.",
    "",
    "| | Links | Right | Precision | 95% interval |",
    "| --- | --- | --- | --- | --- |",
    row("All", judged),
    ...Object.keys(NAMES).map((pair) => row(NAMES[pair], judged.filter((j) => j.pair === pair))),
    "",
    `- This is the precision to expect in the app: ${pct(right, judged.length)}, against ${before} for the links over 0.40 in the sample`,
    "  that chose the bar.",
    "- The wrong ones are mostly a neighbouring idea in the same unit (the schedulers for the dispatcher, a weighted graph",
    "  for a complete one) or another method of the same kind (the full Fourier transform for a sine transform, optimal page",
    "  replacement for LRU). A few are pages with nothing of their own: a list of headings, a page of links.",
    "",
  ].join("\n");
}
