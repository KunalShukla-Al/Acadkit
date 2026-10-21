import { attendanceWorking, oddsWorking, planWorking, sgpaWorking, skipsWorking } from "@acadkit/core/explain";
import type { Working } from "@acadkit/core/working";
import type { Explainable } from "@/components/explainer/explain";
import { ExplainerPlayer, type SceneProps } from "@/components/explainer/player";
import { AttendanceScene } from "@/components/explainer/scenes/attendance";
import { DayScene } from "@/components/explainer/scenes/day";
import { MarksScene } from "@/components/explainer/scenes/marks";
import { OddsScene } from "@/components/explainer/scenes/odds";
import { SgpaScene } from "@/components/explainer/scenes/sgpa";
import { SkipsScene } from "@/components/explainer/scenes/skips";
import { dayWorking } from "@/lib/dayWorking";

/** A number's working and the scene that plays it. */
function explain(what: Explainable): { working: Working<unknown>; scene: (p: SceneProps) => React.ReactNode } | null {
  switch (what.kind) {
    case "attendance":
      return { working: attendanceWorking(what.subject, what.records, what.snapshot), scene: AttendanceScene };
    case "skips":
      return { working: skipsWorking(what.attended, what.total, what.min), scene: SkipsScene };
    case "day": {
      const working = dayWorking(what.plan, what.date);
      return working && { working, scene: DayScene };
    }
    case "plan":
      return { working: planWorking(what.plan), scene: MarksScene };
    case "sgpa":
      return { working: sgpaWorking(what.result), scene: SgpaScene };
    case "odds":
      return { working: oddsWorking(what.odds, { name: what.name, banked: what.banked }), scene: OddsScene };
  }
}

/** The explainer for a tapped number (explain.tsx), loaded only when one opens. */
export default function ExplainerFor({ what, title }: { what: Explainable; title: string }) {
  const found = explain(what);
  if (!found) return <p className="text-sm text-muted">There's nothing to explain here yet.</p>;
  return <ExplainerPlayer title={title} working={found.working} scene={found.scene} />;
}
