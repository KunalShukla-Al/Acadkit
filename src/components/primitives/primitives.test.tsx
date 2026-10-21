/**
 * @vitest-environment happy-dom
 *
 * The primitives, rendered to markup: what each shows, and that a
 * row that goes somewhere is a link or a button.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Figure } from "@/components/primitives/figure";
import { Line } from "@/components/primitives/line";
import { Row, Rows } from "@/components/primitives/row";
import { SheetActions } from "@/components/primitives/sheet";
import { Empty } from "@/components/primitives/empty";

const html = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

describe("the primitives", () => {
  it("Figure shows the number, its unit and what it counts, in its tone", () => {
    const out = html(<Figure value={82} unit="%" label="attendance" tone="good" size="lg" />);
    expect(out).toContain(">82<");
    expect(out).toContain(">%</span>");
    expect(out).toContain(">attendance</p>");
    expect(out).toContain("text-good-deep");
    expect(out).toContain("text-5xl");
  });

  it("Line puts a mark, the sentence and a value on one line", () => {
    const out = html(<Line dot="#f97316" value="10:00">OS in TP304</Line>);
    expect(out).toContain("background-color:#f97316");
    expect(out).toContain(">OS in TP304</span>");
    expect(out).toMatch(/text-muted">10:00</);
  });

  it("Row is a link with `to`, a button with `onClick`, and plain otherwise", () => {
    expect(html(<Row title="Operating Systems" detail="2 classes to spare" value="82%" to="/attendance" />)).toMatch(/^<a [^>]*href="\/attendance"/);
    expect(html(<Row title="Undo" onClick={() => {}} />)).toMatch(/^<button type="button"/);
    const plain = html(<Rows><Row title="DSA" value="76%" /></Rows>);
    expect(plain).toMatch(/^<div class="divide-y"><div class=/);
    expect(plain).not.toContain("<svg");
  });

  it("a sheet's actions put the main one last, and show nothing without any", () => {
    const out = html(<SheetActions primary={{ label: "Delete", onClick: () => {}, danger: true }} secondary={{ label: "Keep", onClick: () => {} }} />);
    expect(out.indexOf(">Keep<")).toBeLessThan(out.indexOf(">Delete<"));
    expect(html(<SheetActions />)).toBe("");
  });

  it("Empty says what isn't there, and offers at most one way on", () => {
    const out = html(<Empty title="No tests this week" detail="Add one from the calendar." action={<a href="/calendar">Open the calendar</a>} />);
    expect(out).toContain(">No tests this week</p>");
    expect(out).toContain(">Add one from the calendar.</p>");
    expect(out).toContain('href="/calendar"');
    expect(html(<Empty title="Nothing here" />)).not.toContain("mt-4");
  });
});
