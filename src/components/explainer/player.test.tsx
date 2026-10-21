/**
 * @vitest-environment happy-dom
 *
 * The explainer player, rendered at a step: the scene on its stage, the
 * step's sentence and sum, and where it is among the steps.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExplainerPlayer, ExplainerStills, type SceneProps } from "@/components/explainer/player";

const working = {
  value: 84,
  steps: [{ say: "You attended 42 of 50." }, { say: "That's 84.0%.", sum: "42 ÷ 50 × 100 = 84.0%" }],
  figures: { attended: 42, total: 50 },
};
const Bar = ({ figures, step }: SceneProps) => <rect width={step === 0 ? 0 : (figures.attended / figures.total) * 320} height={10} data-step={step} />;

describe("the explainer player", () => {
  it("draws the scene at the step, with its sentence and sum", () => {
    const html = renderToStaticMarkup(<ExplainerPlayer title="Attendance in OS" working={working} scene={Bar} autoPlay={false} initialStep={1} />);
    expect(html).toContain('viewBox="0 0 320 180"');
    expect(html).toContain('width="268.8" height="10" data-step="1"');
    expect(html).toContain(">That&#x27;s 84.0%.</p>");
    expect(html).toContain(">42 ÷ 50 × 100 = 84.0%</p>");
    expect(html).toContain('aria-label="Step 2 of 2" aria-current="step"');
    expect(html).toContain('aria-label="Play"');
  });

  it("starts at the first step, playing, with nothing to go back to", () => {
    const html = renderToStaticMarkup(<ExplainerPlayer title="Attendance in OS" working={working} scene={Bar} />);
    expect(html).toContain(">You attended 42 of 50.</p>");
    expect(html).toContain('aria-label="Pause"');
    expect(html).toMatch(/disabled=""[^>]*aria-label="Back a step"/);
  });
});

describe("the stills, for reduced motion", () => {
  it("show every step's scene with its sentence and sum, and nothing to play", () => {
    const html = renderToStaticMarkup(<ExplainerStills title="Attendance in OS" working={working} scene={Bar} />);
    expect(html.match(/<svg/g)).toHaveLength(2);
    expect(html).toContain('data-step="0"');
    expect(html).toContain('data-step="1"');
    expect(html).toContain("You attended 42 of 50.</p>");
    expect(html).toContain(">42 ÷ 50 × 100 = 84.0%</p>");
    expect(html).not.toContain('aria-label="Play"');
  });
});
