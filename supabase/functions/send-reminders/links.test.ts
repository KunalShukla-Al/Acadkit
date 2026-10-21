/// <reference types="node" />
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { movedTo, screenOf } from "../../../src/lib/screens.ts";

// Every link a reminder carries, read from the function as written.
const source = readFileSync(path.join(import.meta.dirname, "index.ts"), "utf8");
const urls = [...source.matchAll(/url: "([^"]+)"/g)].map((m) => m[1]);

describe("the reminders' links", () => {
  it("open their page directly, never one that has moved", () => {
    expect(urls.length).toBeGreaterThanOrEqual(6);
    for (const url of urls) {
      const [pathname, search = ""] = url.split("?");
      expect(movedTo(pathname, search ? `?${search}` : ""), url).toBeNull();
    }
    expect([...new Set(urls.map((u) => screenOf(u.split("?")[0])))].sort()).toEqual(["attendance", "study", "today"]);
  });

  it("speak plainly: no exclamations, no lower-case titles", () => {
    for (const [, title] of source.matchAll(/title: [`"]([^`"\n]+)/g)) {
      expect(title.trim(), title).toMatch(/^[A-Z$]/);
      expect(title, title).not.toMatch(/!/);
    }
  });
});
