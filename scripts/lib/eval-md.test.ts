import { describe, expect, it } from "vitest";
import { withSection } from "./eval-md.mjs";

describe("EVAL.md's sections", () => {
  it("starts the file with its heading, then adds a section", () => {
    expect(withSection("", "## A\n\nfirst")).toBe("# Evaluations\n\nHow well the parts of AcadKit that run a model do, each measured against answers I know.\n\n## A\n\nfirst\n");
  });

  it("replaces a section in place and keeps the rest", () => {
    const text = "# Evaluations\n\n## A\n\nold\n\n## B\n\nkept\n";
    expect(withSection(text, "## A\n\nnew")).toBe("# Evaluations\n\n## A\n\nnew\n\n## B\n\nkept\n");
    expect(withSection(text, "## B\n\nnew")).toBe("# Evaluations\n\n## A\n\nold\n\n## B\n\nnew\n");
    expect(withSection(text, "## C\n\nadded")).toBe("# Evaluations\n\n## A\n\nold\n\n## B\n\nkept\n\n## C\n\nadded\n");
  });
});
