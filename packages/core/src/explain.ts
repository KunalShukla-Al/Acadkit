/**
 * Show your work: each number's working (working.ts), in a module of its
 * own so only the explainers load it, not the screens that show the
 * numbers. Each function returns the same value as the one it explains.
 */
import { computeSubjectAttendance, isAttended, isCounted, ML_ATTENDANCE, project, type SubjectAttendance } from "./attendance.ts";
import { countsInSgpa, GRADE_TABLE, gradeForTotal } from "./grades.ts";
import { DEFAULT_DRAWS, formatChance, type SubjectOdds } from "./odds.ts";
import { floorMarks, type PlanStatus, type SgpaResult, type SubjectPlan } from "./plan.ts";
import type { AttendanceRecord, Grade, PortalSnapshot, Subject } from "./types.ts";
import { count, day, pct, type Step, type Working } from "./working.ts";

/** gradeForTotal with its working: where the total falls in the grade table, and the points that grade is worth. */
export function gradeWorking(total: number): Working<{ grade: Grade; points: number }> {
  const value = gradeForTotal(total);
  const i = GRADE_TABLE.findIndex((g) => g.grade === value.grade);
  const above = i > 0 ? GRADE_TABLE[i - 1] : null;
  const shown = Math.round(total * 10) / 10;
  return {
    value,
    steps: [
      { say: `Your total is ${shown} out of 100.` },
      {
        say: `${value.grade} is ${GRADE_TABLE[i].min} or more${above ? `, below ${above.min}` : ""}, so ${shown} is ${value.grade}.`,
        sum: above ? `${GRADE_TABLE[i].min} ≤ ${shown} < ${above.min}` : `${shown} ≥ ${GRADE_TABLE[i].min}`,
      },
      { say: `${value.grade} is worth ${value.points} grade points.` },
    ],
    figures: { total: shown, min: GRADE_TABLE[i].min, next: above?.min ?? 100, points: value.points },
  };
}

/**
 * computeSubjectAttendance with its working: where the count comes from
 * (the portal up to its date and what you marked since, or what you
 * marked), the percentage, and how far it is from the subject's bar.
 */
export function attendanceWorking(subject: Subject, records: AttendanceRecord[], snapshot?: PortalSnapshot): Working<SubjectAttendance> {
  const value = computeSubjectAttendance(subject, records, snapshot);
  const { attended, total, percentage, min } = value;
  const steps = [];
  if (value.source === "portal" && snapshot) {
    const since = records.filter((r) => isCounted(r.status) && r.date > snapshot.as_of);
    const kept = since.filter((r) => isAttended(r.status)).length;
    steps.push({
      say: `On ${day(snapshot.as_of)} the portal had you at ${snapshot.conducted - snapshot.absent} of ${count(snapshot.conducted, "class", "classes")} in ${subject.name}.`,
      sum: `${snapshot.conducted} − ${snapshot.absent} absent = ${snapshot.conducted - snapshot.absent}`,
    });
    if (since.length) steps.push({ say: `Since then you've marked ${count(since.length, "class", "classes")} and attended ${kept}.` });
  } else {
    steps.push({ say: `You've marked ${count(total, "class", "classes")} of ${subject.name} and attended ${attended}.` });
  }
  if (percentage === null) steps.push({ say: "No class has counted yet, so there's no percentage." });
  else {
    steps.push({ say: `That's ${attended} of ${total}, or ${pct(percentage)}.`, sum: `${attended} ÷ ${total} × 100 = ${pct(percentage)}` });
    const gap = (Math.round(Math.abs(percentage - min) * 10) / 10).toFixed(1);
    const bar = min === ML_ATTENDANCE ? `${min}%, the bar on medical leave` : `${min}%`;
    steps.push({ say: percentage >= min ? `The bar is ${bar}; you're ${gap} points above it.` : `The bar is ${bar}; you're ${gap} points below it.` });
  }
  return { value, steps, figures: { attended, total, percentage: percentage ?? 0, min } };
}

/**
 * The classes you can skip, or must attend in a row, with its working:
 * the inequality that keeps you at the bar, solved, and which way it rounds.
 */
export function skipsWorking(attended: number, total: number, min: number): Working<{ canBunk: number; needToAttend: number }> {
  const value = project(attended, total, min);
  const round = (x: number) => Math.round(x * 100) / 100;
  if (total <= 0) return { value, steps: [{ say: "No class has counted yet, so there's nothing to skip or make up." }], figures: { attended, total, min, ...value } };
  if (100 * attended >= min * total) {
    const raw = (100 * attended - min * total) / min;
    return {
      value,
      steps: [
        { say: `Skip b more classes and you'll have ${attended} of ${total} + b, which must stay at ${min}% or more.`, sum: `100 × ${attended} ≥ ${min} × (${total} + b)` },
        { say: `Solved for b, that's ${round(raw)}.`, sum: `b ≤ (100 × ${attended} − ${min} × ${total}) ÷ ${min} = ${round(raw)}` },
        { say: `A part of a class can't be skipped, so you can skip ${count(value.canBunk, "class", "classes")}.` },
      ],
      figures: { attended, total, min, raw, ...value },
    };
  }
  const raw = (min * total - 100 * attended) / (100 - min);
  return {
    value,
    steps: [
      { say: `Attend the next n classes and you'll have ${attended} + n of ${total} + n, which must reach ${min}%.`, sum: `100 × (${attended} + n) ≥ ${min} × (${total} + n)` },
      { say: `Solved for n, that's ${round(raw)}.`, sum: `n ≥ (${min} × ${total} − 100 × ${attended}) ÷ (100 − ${min}) = ${round(raw)}` },
      { say: `A part of a class doesn't count, so you need ${count(value.needToAttend, "class", "classes")} in a row.` },
    ],
    figures: { attended, total, min, raw, ...value },
  };
}

const subjectName = (s: Subject) => s.short_name?.trim() || s.name;

/**
 * A subject plan's marks needed, with its working: what's banked, what the
 * target grade starts at, what's still to play for, the share of it the
 * target needs, and what that asks of the next test.
 */
export function planWorking(plan: SubjectPlan): Working<{ needed: number; requiredRate: number | null; status: PlanStatus }> {
  const value = { needed: plan.needed, requiredRate: plan.requiredRate, status: plan.status };
  const name = subjectName(plan.subject);
  const banked = floorMarks(plan.banked);
  const { grade, minTotal } = plan.target;
  const figures = { banked, minTotal, needed: plan.needed, pool: plan.pool, rate: plan.requiredRate ?? 0, ceiling: plan.ceiling };
  const steps: Step[] = [{ say: `You've banked ${banked} of the ${floorMarks(plan.gradedMax)} marks played so far in ${name}.` }];
  if (plan.status === "final") {
    steps.push({ say: `Nothing is left to play for, so ${name} ends at ${banked}, which is ${plan.floorGrade}.` });
    return { value, steps, figures };
  }
  if (plan.needed <= 0) {
    steps.push({ say: `${grade} starts at ${minTotal}, and you've banked that already: it holds even at zero from here.`, sum: `${banked} ≥ ${minTotal}` });
    return { value, steps, figures };
  }
  steps.push({ say: `${grade} starts at ${minTotal}, so you need ${floorMarks(plan.needed)} more.`, sum: `${minTotal} − ${banked} = ${floorMarks(plan.needed)}` });
  const tests = floorMarks(plan.remainingInternal);
  steps.push({
    say: `${floorMarks(plan.pool)} marks are still to play for: ${tests} in tests and ${plan.externalWeight} in the end-sem.`,
    sum: `${tests} + ${plan.externalWeight} = ${floorMarks(plan.pool)}`,
  });
  if (plan.status === "out-of-reach") {
    steps.push({ say: `Even full marks on all of it come to ${floorMarks(plan.ceiling)}, short of ${minTotal}.` });
    return { value, steps, figures };
  }
  const rate = (plan.requiredRate ?? 0) * 100;
  steps.push({ say: `That's ${pct(rate)} of everything left.`, sum: `${floorMarks(plan.needed)} ÷ ${floorMarks(plan.pool)} × 100 = ${pct(rate)}` });
  const next = plan.next;
  if (next && next.required !== null) steps.push({ say: `So ${next.label} needs about ${floorMarks(next.required)} of its ${floorMarks(next.max)}.`, sum: `${pct(rate)} × ${floorMarks(next.max)}` });
  return { value, steps, figures };
}

/** An SGPA with its working: each subject's grade points times its credits, added up and divided by the credits. */
export function sgpaWorking(result: SgpaResult): Working<number | null> {
  const counted = result.rows.filter((r) => countsInSgpa(r.subject) && r.marks.hasAnyMarks);
  const weighted = counted.reduce((s, r) => s + r.marks.points * r.subject.credits, 0);
  const steps: Step[] = counted.map((r) => ({
    say: `${subjectName(r.subject)}: ${r.marks.grade} at your current rate, worth ${r.marks.points} points over ${count(r.subject.credits, "credit")}.`,
    sum: `${r.marks.points} × ${r.subject.credits} = ${r.marks.points * r.subject.credits}`,
  }));
  if (result.sgpa === null) steps.push({ say: "No subject with credits has marks yet, so there's no SGPA." });
  else
    steps.push({
      say: `Together that's ${weighted} points over ${result.totalCredits} credits, an SGPA of ${result.sgpa.toFixed(2)}.`,
      sum: `${weighted} ÷ ${result.totalCredits} = ${result.sgpa.toFixed(2)}`,
    });
  const waiting = result.rows.length - counted.length;
  if (waiting) steps.push({ say: `${count(waiting, "subject")} without marks yet, or without credits, ${waiting === 1 ? "doesn't" : "don't"} count.` });
  // Each subject counted, for the scene: points0 and credits0, points1 and credits1, ….
  const each = Object.fromEntries(counted.flatMap((r, i) => [[`points${i}`, r.marks.points], [`credits${i}`, r.subject.credits]]));
  return { value: result.sgpa, steps, figures: { weighted, credits: result.totalCredits, sgpa: result.sgpa ?? 0, subjects: counted.length, ...each } };
}

/**
 * A subject's odds with their working: the ability the odds start from,
 * the simulation, where the totals land, and how many reach the target.
 * `banked` is the subject's /100 so far (its plan's), `name` how to call it.
 */
export function oddsWorking(odds: SubjectOdds, { name, banked, draws = DEFAULT_DRAWS }: { name: string; banked: number; draws?: number }): Working<number> {
  const r = (x: number) => Math.round(x * 10) / 10;
  const min = GRADE_TABLE.find((g) => g.grade === odds.target)?.min ?? 0;
  const figures = { ability: odds.ability, banked: r(banked), p10: r(odds.p10), median: r(odds.median), p90: r(odds.p90), pTarget: odds.pTarget, min };
  if (odds.final)
    return { value: odds.pTarget, steps: [{ say: `Nothing is left to play for, so ${name} ends at ${r(odds.median)} out of 100, which is ${gradeForTotal(odds.median).grade}.` }], figures };
  const ability = pct(odds.ability * 100);
  return {
    value: odds.pTarget,
    steps: [
      odds.evidence
        ? { say: `Weighing your ${count(odds.evidence, "graded test")} in ${name} with how you do across all your subjects, you're expected to take about ${ability} of a test's marks.` }
        : { say: `Nothing is graded in ${name} yet, so it starts from how you do across all your subjects: about ${ability} of a test's marks.` },
      { say: `With ${r(banked)} banked, the app plays out what's left ${draws.toLocaleString("en-IN")} times, each test and the end-sem drawn around that.` },
      { say: `In the middle 80% of those, you finish between ${r(odds.p10)} and ${r(odds.p90)}, and half the time above ${r(odds.median)}.` },
      { say: `${formatChance(odds.pTarget)} of them end at ${odds.target} or better.` },
    ],
    figures,
  };
}
