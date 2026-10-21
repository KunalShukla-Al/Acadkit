import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/**
 * The same suite on WebKit, as a Mac: Safari's engine in a 1440 × 900
 * window, with a mouse and no touch screen (`npm run test:mac`). The phone's
 * own specs skip themselves here; the screen pictures are Chromium's.
 */
export default defineConfig({
  ...base,
  use: { ...base.use, ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } },
  testIgnore: ["visual.spec.ts"],
});
