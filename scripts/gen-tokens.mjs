#!/usr/bin/env node
/** Writes src/design/tokens.css from src/design/tokens.json (npm run tokens). */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tokensCss } from "../src/design/css.ts";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/design");
const tokens = JSON.parse(readFileSync(path.join(dir, "tokens.json"), "utf8"));
writeFileSync(path.join(dir, "tokens.css"), tokensCss(tokens));
console.log(`Wrote src/design/tokens.css: ${Object.keys(tokens.themes).join(", ")}`);
