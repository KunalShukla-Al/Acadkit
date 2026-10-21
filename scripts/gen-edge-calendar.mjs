/** Generates the edge function's copy of the **official holidays** from packages/core/src/semester.ts. */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const OUT = resolve(root, "supabase/functions/send-reminders/calendar.generated.ts");

// Node 24 runs the TypeScript source as it is (type stripping).
const sem = await import(resolve(root, "packages/core/src/semester.ts"));

function holidayLines(map) {
  return Object.entries(map)
    .map(([k, v]) => `  "${k}": ${JSON.stringify(v)},`)
    .join("\n");
}

const out = `// GENERATED FILE - DO NOT EDIT.
// Written by scripts/gen-edge-calendar.mjs from packages/core/src/semester.ts.

export const OFFICIAL_HOLIDAYS: Record<string, string> = {
${holidayLines(sem.OFFICIAL_HOLIDAYS)}
};
`;

writeFileSync(OUT, out);
console.log(
  `Wrote ${OUT.replace(root + "/", "")}  ` +
    `(${Object.keys(sem.OFFICIAL_HOLIDAYS).length} holidays)`
);
