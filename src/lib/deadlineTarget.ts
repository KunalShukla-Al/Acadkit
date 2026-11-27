import type { Grade } from "@acadkit/core/grades";
import { labelMatchKey } from "@acadkit/core/componentLabel";
import {
  ceilHalf,
  gradeForTargetSgpa,
  solveSubjectPlan,
  type SolveOptions,
} from "@acadkit/core/plan";
import { expectedOutlook } from "@acadkit/core/expected";
import type { Deadline, Mark, Subject } from "@acadkit/core/types";
import { isEndSem } from "@/lib/deadlines";

/** What an upcoming test has to return. */
export interface DeadlineNeed {
  /** Marks this test has to return, rounded up to the next half. */
  required: number;
  /** What the test is out of. */
  max: number;
  /** The grade it is being asked for. */
  grade: Grade;
  /** False when full marks here still would not keep the target alive. */
  reachable: boolean;
  /** True when nothing is needed - the grade holds regardless. */
  secured: boolean;
  /** The score you said you expect (Marks → Targets), not one the grade asks for. */
  expected?: boolean;
}

export interface DeadlineNeedOptions extends SolveOptions {
  /** Falls back to the semester target when the subject has no view. */
  targetSgpa?: number;
  /** The last teaching day: an exam after it is the end-sem. */
  semEnd?: string | null;
}

export function deadlineNeed(
  deadline: Pick<Deadline, "id" | "title" | "max_marks" | "type" | "due_date">,
  subject: Subject,
  subjectMarks: Mark[],
  options: DeadlineNeedOptions = {}
): DeadlineNeed | null {
  const max = Number(deadline.max_marks ?? 0);
  if (!Number.isFinite(max) || max <= 0) return null;

  const grade = subject.target_grade ?? gradeForTargetSgpa(options.targetSgpa ?? 8.5);
  if (isEndSem(deadline, options.semEnd ?? null)) return endSemNeed(max, subject, subjectMarks, grade, options);
  const plan = solveSubjectPlan(subject, subjectMarks, grade, options);

  // The component this deadline became, or the planned one it named.
  const key = `deadline:${deadline.id}`;
  const title = labelMatchKey(deadline.title);
  const component =
    plan.components.find((c) => c.key === key) ??
    plan.components.find((c) => labelMatchKey(c.label) === title);

  // Already marked, or not in the budget at all: nothing to ask for.
  if (!component || component.obtained !== null || component.required === null) return null;

  /** A component is not always assessed in one sitting. */
  const share = Math.min(max, component.max);
  const scale = component.max > 1e-9 ? share / component.max : 1;
  const needed = component.required * scale;

  return {
    required: ceilHalf(needed),
    max: share,
    grade,
    // Reachability is a property of the component, not of one sitting:
    // a target out of reach overall is not rescued by acing this part.
    reachable: component.required <= component.max + 1e-9,
    secured: needed <= 1e-9,
  };
}

/**
 * The end-sem's ask, solved as Marks → Targets solves it (the same outlook
 * the Run-up uses), so the three can't disagree. A paper out of 75 scales
 * to the external weight it carries.
 */
function endSemNeed(max: number, subject: Subject, subjectMarks: Mark[], grade: Grade, options: SolveOptions): DeadlineNeed | null {
  const outlook = expectedOutlook(subject, subjectMarks, grade, options);
  const external = outlook.plan.components.find((c) => c.kind === "external");
  if (!external || external.obtained !== null || external.max <= 1e-9) return null;
  const expected = external.assumed !== null;
  const ask = external.assumed ?? external.required;
  if (ask === null) return null;
  const needed = (ask * max) / external.max;
  return {
    required: ceilHalf(needed),
    max,
    grade,
    reachable: ask <= external.max + 1e-9,
    secured: !expected && needed <= 1e-9,
    expected,
  };
}

/** One line for a deadline row: the shortest true thing to say. */
export function describeNeed(need: DeadlineNeed): string {
  if (need.expected) return `you expect ${need.required}/${Math.round(need.max)}`;
  if (need.secured) return `${need.grade} is safe`;
  if (!need.reachable) return `${need.grade} needs more than this test`;
  return `${need.required}/${Math.round(need.max)} for ${need.grade}`;
}
