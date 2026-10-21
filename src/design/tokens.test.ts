import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hslToHex } from "./color";
import { backgrounds, resolve, tokensCss } from "./css";
import tokens from "./tokens.json";

describe("design tokens", () => {
  it("tokens.css is what tokens.json makes (npm run tokens)", () => {
    const written = readFileSync(path.join(import.meta.dirname, "tokens.css"), "utf8");
    expect(written).toBe(tokensCss(tokens));
  });

  it("gives every theme the same tokens in both modes", () => {
    for (const [name, theme] of Object.entries(tokens.themes)) {
      expect(Object.keys(theme.dark).sort(), name).toEqual(Object.keys(theme.light).sort());
    }
  });

  it("follows a token that names another", () => {
    expect(resolve({ brand: "{accent}", accent: "{accent-2}", "accent-2": "6 78% 60%" }, "brand")).toBe("6 78% 60%");
    expect(tokensCss({ themes: { t: { light: { brand: "{accent}" }, dark: { brand: "0 0% 9%" } } } })).toContain("--brand: var(--accent);");
  });

  it("knows each background as hex, for the browser's theme colour", () => {
    expect(hslToHex("0 0% 97%")).toBe("#f7f7f7");
    expect(hslToHex("72 89% 56%")).toBe("#cbf32b");
    expect(backgrounds(tokens)).toMatchObject({ "oled-dark": "#000000", "brutalist-light": "#f7f7f7" });
  });

  it("launches a phone into the default theme's dark background and loads into its light one", () => {
    const at = (file: string) => readFileSync(path.join(import.meta.dirname, "..", "..", file), "utf8");
    const manifest = at("vite.config.ts");
    const dark = backgrounds(tokens)["brutalist-dark"];
    expect(/background_color: "(#[0-9a-f]{6})"/.exec(manifest)?.[1]).toBe(dark);
    expect(/theme_color: "(#[0-9a-f]{6})"/.exec(manifest)?.[1]).toBe(dark);
    expect(/id="theme-color-meta" content="(#[0-9a-f]{6})"/.exec(at("index.html"))?.[1]).toBe(backgrounds(tokens)["brutalist-light"]);
  });
});
