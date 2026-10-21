import { motion } from "motion/react";
import type { SceneProps } from "@/components/explainer/player";
import { SCENE_TRANSITION, STAGE } from "@/lib/explainer";

const SIDE = 14;
const GAP = 4;
const MAX = 15;

/**
 * skipsWorking (packages/core/src/attendance.ts) as a scene: the
 * inequality, then its answer, then the classes it comes to, as squares:
 * outlined for ones you can skip, filled for ones you must attend.
 */
export function SkipsScene({ figures, step }: SceneProps) {
  const { attended, total, min, raw, canBunk, needToAttend } = figures;
  if (!total)
    return (
      <text x={STAGE.width / 2} y={STAGE.height / 2} textAnchor="middle" className="fill-muted text-[11px]">
        No classes yet
      </text>
    );
  const skipping = canBunk > 0 || needToAttend === 0;
  const n = skipping ? canBunk : needToAttend;
  const shown = Math.min(n, MAX);
  const x0 = (STAGE.width - shown * (SIDE + GAP) + GAP) / 2;
  const question = skipping ? `${attended} ÷ (${total} + b) ≥ ${min}%` : `(${attended} + n) ÷ (${total} + n) ≥ ${min}%`;
  const answer = skipping ? `b ≤ ${Math.round(raw * 100) / 100}` : `n ≥ ${Math.round(raw * 100) / 100}`;
  return (
    <g>
      <motion.text
        x={STAGE.width / 2}
        textAnchor="middle"
        className="fill-ink font-mono text-[13px]"
        initial={false}
        animate={{ y: step === 0 ? 70 : 34, opacity: step === 0 ? 1 : 0.5 }}
        transition={SCENE_TRANSITION}
      >
        {question}
      </motion.text>
      <motion.text
        x={STAGE.width / 2}
        textAnchor="middle"
        className="fill-ink font-mono text-[15px] font-bold"
        initial={false}
        animate={{ y: step === 1 ? 82 : 62, opacity: step >= 1 ? 1 : 0 }}
        transition={SCENE_TRANSITION}
      >
        {answer}
      </motion.text>
      {Array.from({ length: shown }, (_, i) => (
        <motion.rect
          key={i}
          x={x0 + i * (SIDE + GAP)}
          y={100}
          width={SIDE}
          height={SIDE}
          rx={3}
          strokeWidth={1.5}
          className={skipping ? "fill-transparent stroke-good" : "fill-ink stroke-ink"}
          initial={false}
          animate={{ opacity: step >= 2 ? 1 : 0, scale: step >= 2 ? 1 : 0.6 }}
          transition={{ ...SCENE_TRANSITION, delay: step >= 2 ? i * 0.04 : 0 }}
        />
      ))}
      <motion.text
        x={STAGE.width / 2}
        y={142}
        textAnchor="middle"
        className="fill-muted text-[10px]"
        initial={false}
        animate={{ opacity: step >= 2 ? 1 : 0 }}
        transition={SCENE_TRANSITION}
      >
        {skipping ? `${n} you can skip` : `${n} in a row to attend`}
        {n > MAX ? ` (${MAX} shown)` : ""}
      </motion.text>
    </g>
  );
}
