#!/usr/bin/env node
/**
 * Every Shortcut built and signed, as the Mac does for an account
 * (scripts/lib/shortcuts.mjs), with a dummy link: `npm run shortcuts:check`,
 * on a Mac only. Signing goes through Apple's service, so this checks the
 * builders, plutil and `shortcuts sign` together before a release. Nothing
 * is uploaded or kept.
 */
import { acadkitShortcut, alarmShortcut, feedLinks, focusShortcut, leaveShortcut, screenshotShortcut, signedShortcut } from "./lib/shortcuts.mjs";

const links = feedLinks("https://example.supabase.co", "0".repeat(48));
const builds = {
  "AcadKit Alarm": alarmShortcut(links.today),
  "AcadKit Focus": focusShortcut(links.today),
  "AcadKit Leave": leaveShortcut(links),
  AcadKit: acadkitShortcut(links),
  "AcadKit Screenshot": screenshotShortcut(links),
};

let failed = 0;
for (const [name, workflow] of Object.entries(builds)) {
  try {
    const bytes = await signedShortcut(workflow);
    // A signed Shortcut is an Apple Encrypted Archive.
    if (bytes.subarray(0, 4).toString("latin1") !== "AEA1") throw new Error("not a signed archive");
    console.log(`✓ ${name}: signed, ${(bytes.length / 1024).toFixed(1)} KB`);
  } catch (err) {
    failed++;
    console.log(`✗ ${name}: ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
