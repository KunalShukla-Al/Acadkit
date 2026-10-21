#!/usr/bin/env node
/**
 * Builds the embedding space (scripts/lib/connected.mjs) from the study
 * folder, as the night shift will, links it by meaning and by time
 * (scripts/lib/links.mjs) and says what's in it. Vectors already made are read from cache, so a
 * second run is quick.
 *
 * --check: the question-page and question-slide bars against my labels.
 * Each pair with a unit on both sides is right when the units agree; it
 * prints how often they do at each bar, and the lowest bar at which 80% do.
 */
import { buildSpace, spaceSummary } from "./lib/connected.mjs";
import { checkBar, linkByMeaning, linkByTime, mergeLinks, unitPairs } from "./lib/links.mjs";
import { STUDY } from "./lib/paper-eval.mjs";

const started = Date.now();
const { items, means } = await buildSpace({ dir: STUDY });
console.log(`The space: ${items.length.toLocaleString("en-IN")} items, built in ${Math.round((Date.now() - started) / 1000)} s.`);
for (const line of spaceSummary(items)) console.log(`  ${line}`);

const linking = Date.now();
const byTime = linkByTime(items);
const links = mergeLinks(byTime, linkByMeaning(items, means));
const count = (set) => Object.values(set).reduce((n, l) => n + l.length, 0);
console.log(
  `Links: ${Object.keys(links).length.toLocaleString("en-IN")} items with ${count(links).toLocaleString("en-IN")} links, ${count(byTime).toLocaleString("en-IN")} of them by time, in ${Math.round((Date.now() - linking) / 1000)} s.`
);

if (process.argv.includes("--check")) {
  for (const kind of ["page", "slide"]) {
    const pairs = unitPairs(items, means, [kind]);
    const chance = pairs.filter((p) => p.right).length / (pairs.length || 1);
    console.log(`\nquestion-${kind}: ${pairs.length.toLocaleString("en-IN")} pairs with a unit on both sides, ${Math.round(chance * 100)}% in the same unit by chance`);
    console.log("  bar    links  same unit");
    for (const bar of [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5]) {
      const above = pairs.filter((p) => p.score >= bar);
      if (!above.length) break;
      console.log(`  ${bar.toFixed(2)}  ${String(above.length).padStart(7)}  ${Math.round((above.filter((p) => p.right).length / above.length) * 100)}%`);
    }
    const found = checkBar(pairs, { precision: 0.8 });
    console.log(found ? `  lowest bar with 80% in the same unit: ${found.bar} (${found.pairs} links)` : "  no bar reaches 80% in the same unit");
  }
}
