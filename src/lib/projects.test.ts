import { describe, expect, it } from "vitest";
import { orderedTodos } from "@/lib/projects";

describe("orderedTodos", () => {
  it("puts dated to-dos first, soonest first, then the rest in their order", () => {
    const list = orderedTodos([
      { text: "a", project: null, due: null },
      { text: "b", project: null, due: "2026-10-21" },
      { text: "c", project: null, due: null },
      { text: "d", project: null, due: "2026-10-16" },
    ]);
    expect(list.map((t) => t.text)).toEqual(["d", "b", "a", "c"]);
  });
});
