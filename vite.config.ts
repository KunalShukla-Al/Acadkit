import path from "path";
import { webcrypto } from "node:crypto";
import { defineConfig } from "vite";

// Node 18 lacks the global webcrypto that workbox's minifier expects
if (!globalThis.crypto) {
  (globalThis as Record<string, unknown>).crypto = webcrypto;
}

import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { backgrounds } from "./src/design/css.ts";
import babel from "@rolldown/plugin-babel";
import { VitePWA } from "vite-plugin-pwa";

/**
 * pdf.js decodes some image codecs in WebAssembly and fetches the modules
 * at run time from `wasmUrl` (see components/viewer/pdf-view.tsx). Without
 * them it silently drops the images: a scanned paper whose text is stored
 * as CCITT/JBIG2 masks showed its grey background and no text at all. They
 * are copied into public/ (gitignored) so dev and build both serve them.
 */
const PDFJS_WASM = [
  "jbig2.wasm",
  "jbig2_nowasm_fallback.js",
  "openjpeg.wasm",
  "openjpeg_nowasm_fallback.js",
  "qcms_bg.wasm",
];
function pdfjsWasm() {
  return {
    name: "pdfjs-wasm",
    buildStart() {
      const out = path.resolve(import.meta.dirname, "public/pdfjs-wasm");
      mkdirSync(out, { recursive: true });
      for (const f of PDFJS_WASM) copyFileSync(path.resolve(import.meta.dirname, "node_modules/pdfjs-dist/wasm", f), path.join(out, f));
    },
  };
}

/**
 * The build's release tag, "2.0.0+d6b27fa": package version plus commit.
 * Crash reports carry it (src/lib/release.ts), so a crash can be tied to
 * the deploy it came from. Vercel and CI provide the commit; a local build
 * asks git.
 */
function release(): string {
  const { version } = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "package.json"), "utf8"));
  let sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "";
  if (!sha) {
    try {
      sha = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      sha = "dev";
    }
  }
  return `${version}+${sha.slice(0, 7)}`;
}

/** The pre-paint script in index.html gets the themes and their backgrounds from src/design/tokens.json. */
function themeTokens() {
  return {
    name: "theme-tokens",
    transformIndexHtml(html: string) {
      const tokens = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "src/design/tokens.json"), "utf8"));
      return html
        .replace("__THEME_BACKGROUNDS__", JSON.stringify(backgrounds(tokens)))
        .replace("__THEME_NAMES__", JSON.stringify(Object.keys(tokens.themes)));
    },
  };
}

/**
 * The touch icon inside the page, as a data URI. iOS's Add to Home Screen
 * sheet fetches a linked icon with a loader of its own, and when that
 * fetch fails it draws the name's first letter instead; an icon already
 * in the page needs no fetch. The PNGs in public/ stay for whatever asks
 * the site directly.
 */
function touchIcon() {
  return {
    name: "touch-icon",
    transformIndexHtml(html: string) {
      const png = readFileSync(path.resolve(import.meta.dirname, "public/apple-touch-icon.png")).toString("base64");
      return html.replace('href="/apple-touch-icon.png"', `href="data:image/png;base64,${png}"`);
    },
  };
}

export default defineConfig({
  define: {
    __APP_RELEASE__: JSON.stringify(release()),
  },
  plugins: [
    pdfjsWasm(),
    themeTokens(),
    touchIcon(),
    react(),
    // The React Compiler memoizes components and hooks; lint keeps src within its rules.
    babel({ presets: [reactCompilerPreset()] }),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icons/*.png", "apple-touch-icon*.png", "favicon.ico"],
      manifest: {
        name: "AcadKit",
        short_name: "AcadKit",
        description: "Your academic companion for SRM KTR",
        // Not a free choice: background_color is what iOS paints when no
        // apple-touch-startup-image matches (an iPhone newer than the list
        // in scripts/generate-splash.mjs), so it has to be a real theme
        // background or a new phone launches into a colour the app never
        // uses: brutalist dark's --bg (src/design/tokens.test.ts checks it).
        // A manifest holds one value and the default theme mode is
        // "system", so dark is the side that gets the seamless launch; the
        // startup images are what cover light properly.
        theme_color: "#0a0a0a",
        background_color: "#0a0a0a",
        display: "standalone",
        orientation: "portrait",
        id: "/",
        scope: "/",
        start_url: "/",
        // One purpose an entry: iOS reads only "any" icons, and an entry that
        // is also "maskable" is one it may skip. Android crops the maskable one.
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Node 18 workers lack global webcrypto, which workbox's terser
        // step needs; ship the SW unminified there (it's cached anyway).
        mode: Number(process.versions.node.split(".")[0]) >= 20 ? "production" : "development",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Safari loads launch screens itself, straight from the network,
        // at install time. Precaching 22 of them would add ~600 KB to
        // every install to serve images the SW is never asked for.
        // The file viewer's libraries (PDF, Word, PowerPoint, code) are
        // ~2 MB and only ever run with a file in hand, which needs the
        // network anyway. Fetched when a file is first opened, not on
        // every install.
        globIgnores: ["**/splash/**", "**/viewer-*", "**/pdf.worker*", "**/pdfjs-wasm/**"],
        // Custom Web Push handlers, loaded into the generated SW
        importScripts: ["push-sw.js"],
        // No runtime caching. Supabase responses used to be cached here,
        // which kept a day of one account's API replies on disk after it
        // signed out — while React Query's persisted cache already covers
        // offline, and sign-out clears that one. Fonts ship in the bundle.
      },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        /**
         * Vendor code changes far less often than app code. Splitting it
         * out means a normal release only invalidates the app chunk, so
         * returning users re-download kilobytes instead of the whole
         * bundle — which matters more here than raw size, because the
         * service worker precaches every chunk it hasn't seen.
         *
         * A group also takes the dependencies it uses, so React goes
         * first: otherwise the motion group took React's JSX runtime, and
         * the landing page loaded all of motion to get it.
         */
        codeSplitting: {
          groups: [
            { name: "vendor-react", test: /[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/, priority: 3 },
            { name: "vendor-supabase", test: /[\\/]node_modules[\\/]@supabase[\\/]/, priority: 2 },
            { name: "vendor-motion", test: /[\\/]node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/, priority: 2 },
            { name: "vendor-query", test: /[\\/]node_modules[\\/]@tanstack[\\/]/, priority: 2 },
            // The file viewer's renderers, named so the precache can skip them.
            { name: "viewer-pdf", test: /pdfjs-dist/, priority: 1 },
            { name: "viewer-docx", test: /docx-preview/, priority: 1 },
            { name: "viewer-zip", test: /jszip|pako/, priority: 1 },
            { name: "viewer-code", test: /highlight\.js/, priority: 1 },
            { name: "viewer-sheet", test: /read-excel-file|fflate|saxen|unzipper-esm|worker-f/, priority: 1 },
            // No catch-all group: a generic "vendor" chunk ends up in a
            // cycle with vendor-react. Everything else stays where the
            // bundler puts it.
          ],
        },
      },
    },
  },

  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
