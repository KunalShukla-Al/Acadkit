/**
 * Fail the build when the installed app can't start from its own copy.
 * Run after `vite build`: `npm run precache`.
 *
 * The service worker serves the app from its precache and fetches
 * anything left out from the network. That works only while the server
 * still has the same build: after a deploy, a precached chunk that imports
 * a file outside the precache asks for a name that's gone, and the app
 * fails with "Importing a module script failed" until it's closed. So
 * index.html and every chunk a precached chunk imports must be precached
 * too. Lazy imports, such as the file viewer's libraries, may stay out.
 */
import { appendFileSync, readFileSync } from "node:fs";

const read = (file) => {
  try {
    return readFileSync(`dist/${file}`, "utf8");
  } catch {
    console.error(`No dist/${file} - run \`npx vite build\` first.`);
    process.exit(1);
  }
};

// Production builds write `url:"…"`, development builds `"url": "…"`.
const precached = new Set([...read("sw.js").matchAll(/\burl"?:\s*"([^"]+)"/g)].map((m) => m[1]));

/** Each file left out, with what imports it. */
const missing = new Map();
const need = (dep, by) => {
  if (!precached.has(dep)) missing.set(dep, [...(missing.get(dep) ?? []), by]);
};
for (const m of read("index.html").matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)) need(m[1], "index.html");
for (const file of precached) {
  if (!file.startsWith("assets/") || !file.endsWith(".js")) continue;
  for (const m of read(file).matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) need(`assets/${m[1]}`, file);
}

const short = (file) => file.replace(/^assets\//, "");
const lines = missing.size
  ? [...missing].map(([dep, by]) => `✗ ${short(dep)} isn't precached, but ${by.length} precached files import it: ${by.map(short).sort().join(", ")}`)
  : [`✓ Precache: ${precached.size} files, and every chunk they import is one of them`];
console.log(lines.join("\n"));

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Precache\n\n${lines.map((l) => `- ${l}`).join("\n")}\n`);
}
if (missing.size) {
  console.error("\nA deploy would break every installed app still on this build. Precache these files (vite.config.ts, globIgnores).");
  process.exit(1);
}
