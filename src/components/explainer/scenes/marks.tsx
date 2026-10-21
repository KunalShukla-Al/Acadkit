import { motion } from "motion/react";
import type { SceneProps } from "@/components/explainer/player";
import { SCENE_TRANSITION, STAGE } from "@/lib/explainer";

const X = 16;
const W = STAGE.width - 2 * X;
const Y = 84;
const H = 16;
/** A total out of 100, along the scale. */
const at = (marks: number) => X + (W * Math.min(100, Math.max(0, marks))) / 100;

/**
 * planWorking (packages/core/src/explain.ts) as a scene, on a 0–100 scale:
 * what's banked; where the target grade starts and the gap to it; the
 * end-sem you expect, when you've said; what's still to play for; and how
 * much of that the target needs. Each step adds one, in the working's order.
 */
export function MarksScene({ figures, step }: SceneProps) {
  const { banked, minTotal, needed, pool } = figures;
  const assumed = figures.assumed ?? 0;
  // An assumed end-sem is a step of its own, after the gap: what's left to play for and the ask come one later.
  const after = assumed > 0 ? 1 : 0;
  const show = (k: number) => (step >= k ? 1 : 0);
  const gap = Math.max(0, needed);
  const from = banked + assumed;
  return (
    <g>
      <rect x={X} y={Y} width={W} height={H} rx={4} className="fill-ink/10" />
      <motion.rect
        x={X}
        y={Y}
        height={H}
        rx={4}
        className="fill-ink"
        initial={false}
        animate={{ width: at(banked) - X }}
        transition={SCENE_TRANSITION}
      />
      <text x={X} y={Y + H + 14} className="fill-muted text-[9px]">
        {banked} banked
      </text>
      {/* The end-sem you expect, counted after what's banked. */}
      {assumed > 0 && (
        <motion.rect
          x={at(banked)}
          y={Y}
          height={H}
          rx={4}
          className="fill-ink/40"
          initial={false}
          animate={{ width: at(from) - at(banked), opacity: show(2) }}
          transition={SCENE_TRANSITION}
        />
      )}
      {/* What's still to play for, outlined beyond that. */}
      <motion.rect
        x={at(from)}
        y={Y}
        height={H}
        rx={4}
        className="fill-transparent stroke-ink"
        strokeDasharray="3 2"
        initial={false}
        animate={{ width: at(from + pool) - at(from), opacity: show(2 + after) }}
        transition={SCENE_TRANSITION}
      />
      {/* What the target needs of it. */}
      <motion.rect
        x={at(from)}
        y={Y + 3}
        height={H - 6}
        rx={3}
        className="fill-accent"
        initial={false}
        animate={{ width: step >= 3 + after ? at(from + gap) - at(from) : 0 }}
        transition={SCENE_TRANSITION}
      />
      <motion.g initial={false} animate={{ opacity: show(1) }} transition={SCENE_TRANSITION}>
        <line x1={at(minTotal)} x2={at(minTotal)} y1={Y - 8} y2={Y + H + 4} className="stroke-ink" strokeWidth={1.5} />
        <text x={at(minTotal)} y={Y - 12} textAnchor="middle" className="fill-ink text-[10px] font-bold">
          target {minTotal}
        </text>
      </motion.g>
      <motion.text
        x={(at(banked) + at(minTotal)) / 2}
        y={Y + H + 28}
        textAnchor="middle"
        className="fill-ink text-[10px] font-semibold"
        initial={false}
        animate={{ opacity: gap > 0 ? show(1) : 0 }}
        transition={SCENE_TRANSITION}
      >
        {needed > 0 ? `${Math.round(needed * 10) / 10} to go` : ""}
      </motion.text>
      <motion.text
        x={at(from + pool)}
        y={Y + H + 14}
        textAnchor="end"
        className="fill-muted text-[9px]"
        initial={false}
        animate={{ opacity: show(2 + after) }}
        transition={SCENE_TRANSITION}
      >
        {Math.round(pool * 10) / 10} to play for
      </motion.text>
    </g>
  );
}
