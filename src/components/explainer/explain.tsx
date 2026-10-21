import { lazy, Suspense, useState, type ReactNode } from "react";
import type { AttendanceRecord, PortalSnapshot, Subject } from "@acadkit/core/types";
import type { SubjectOdds } from "@acadkit/core/odds";
import type { SgpaResult, SubjectPlan } from "@acadkit/core/plan";
import { Sheet } from "@/components/primitives/sheet";
import type { SurvivalPlan } from "@/lib/survival";
import { cn } from "@/lib/utils";

/** A number the app can explain, and what its working is worked out from. */
export type Explainable =
  | { kind: "attendance"; subject: Subject; records: AttendanceRecord[]; snapshot?: PortalSnapshot }
  | { kind: "skips"; attended: number; total: number; min: number }
  | { kind: "day"; plan: SurvivalPlan; date: string }
  | { kind: "plan"; plan: SubjectPlan }
  | { kind: "sgpa"; result: SgpaResult }
  | { kind: "odds"; odds: SubjectOdds; name: string; banked: number };

// The working and the scenes load only when an explainer opens.
const ExplainerFor = lazy(() => import("@/components/explainer/explainer-for"));

/**
 * A number you can tap to see how it was worked out: dotted underline, and
 * a sheet with its explainer (src/components/explainer/player.tsx).
 */
export function Explain({ what, title, children, className }: { what: Explainable; title: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("underline decoration-dotted decoration-1 underline-offset-4", className)}
        aria-label={`${title}: how it's worked out`}
      >
        {children}
      </button>
      <Sheet open={open} onOpenChange={setOpen} title={title}>
        {open && (
          <Suspense fallback={<div className="aspect-video w-full animate-pulse rounded-2xl bg-surface-2" />}>
            <ExplainerFor what={what} title={title} />
          </Suspense>
        )}
      </Sheet>
    </>
  );
}
