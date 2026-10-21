import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/**
 * The same suite on WebKit, as an iPhone: Safari's engine with the iPhone's
 * screen, touch and user agent (`npm run test:iphone`). The screen pictures
 * are left out: each engine draws text its own way, and they're Chromium's.
 */
export default defineConfig({
  ...base,
  use: { ...base.use, ...devices["iPhone 15"] },
  testIgnore: ["visual.spec.ts"],
});
