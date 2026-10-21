import { motion } from "motion/react";
import type { SceneProps } from "@/components/explainer/player";
import { SCENE_TRANSITION, STAGE } from "@/lib/explainer";

const X = 16;
const W = STAGE.width - 2 * X;
const Y = 100;
const H = 14;
const at = (marks: number) => X + (W * Math.min(100, Math.max(0, marks))) / 100;

/**
 * oddsWorking (packages/core/src/explain.ts) as a scene: the share of a
 * test's marks you're expected to take; what's banked on a 0–100 scale;
 * the middle 80% of where the runs finish, and their median; then the
 * target's line and the share of runs past it.
 */
export function OddsScene({ figures, step, count }: SceneProps) {
  const { ability, banked, p10, median, p90, pTarget, min } = figures;
  if (count === 1)
    return (
      <text x={STAGE.width / 2} y={STAGE.height / 2} textAnchor="middle" className="fill-ink text-[13px] font-bold">
        Ends at {median}
      </text>
    );
  const show = (k: number) => (step >= k ? 1 : 0);
  return (
    <g>
      <motion.text
        x={STAGE.width / 2}
        y={44}
        textAnchor="middle"
        className="fill-ink text-[14px] font-bold"
        initial={false}
        animate={{ opacity: step === 0 || step === 3 ? 1 : 0.35 }}
        transition={SCENE_TRANSITION}
      >
        {step >= 3 ? `${Math.round(pTarget * 100)}% reach the target` : `about ${Math.round(ability * 100)}% of a test's marks`}
      </motion.text>
      <motion.g initial={false} animate={{ opacity: show(1) }} transition={SCENE_TRANSITION}>
        <rect x={X} y={Y} width={W} height={H} rx={4} className="fill-ink/10" />
        <rect x={X} y={Y} width={at(banked) - X} height={H} rx={4} className="fill-ink" />
        <text x={X} y={Y + H + 14} className="fill-muted text-[9px]">
          {banked} banked
        </text>
      </motion.g>
      <motion.rect
        y={Y - 4}
        height={H + 8}
        rx={6}
        className="fill-accent/35"
        initial={false}
        animate={{ x: at(p10), width: step >= 2 ? at(p90) - at(p10) : 0, opacity: show(2) }}
        transition={SCENE_TRANSITION}
      />
      <motion.g initial={false} animate={{ opacity: show(2) }} transition={SCENE_TRANSITION}>
        <line x1={at(median)} x2={at(median)} y1={Y - 6} y2={Y + H + 6} className="stroke-ink" strokeWidth={1.5} />
        <text x={at(median)} y={Y + H + 26} textAnchor="middle" className="fill-ink text-[9px] font-semibold">
          half finish above {median}
        </text>
      </motion.g>
      <motion.g initial={false} animate={{ opacity: show(3) }} transition={SCENE_TRANSITION}>
        <line x1={at(min)} x2={at(min)} y1={Y - 20} y2={Y + H + 4} className="stroke-accent" strokeWidth={2} strokeDasharray="3 2" />
        <text x={at(min)} y={Y - 24} textAnchor="middle" className="fill-ink text-[9px] font-bold">
          target {min}
        </text>
      </motion.g>
    </g>
  );
}
