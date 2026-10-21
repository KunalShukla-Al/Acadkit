import { motion } from "motion/react";
import type { SceneProps } from "@/components/explainer/player";
import { SCENE_TRANSITION, STAGE } from "@/lib/explainer";

const X = 24;
const W = STAGE.width - 2 * X;
const BASE = 150;
const TOP = 30;
/** Grade points (0–10) as a height above the base line. */
const up = (points: number) => ((BASE - TOP) * points) / 10;

/**
 * sgpaWorking (packages/core/src/explain.ts) as a scene: each subject a
 * bar as wide as its credits and as tall as its grade points, in as its
 * step comes; then the SGPA, their credit-weighted level, as a line
 * across them all.
 */
export function SgpaScene({ figures, step }: SceneProps) {
  const n = figures.subjects;
  const credits = Array.from({ length: n }, (_, i) => figures[`credits${i}`]);
  const total = credits.reduce((a, c) => a + c, 0) || 1;
  const gap = 4;
  const unit = (W - gap * (n - 1)) / total;
  const done = step >= n;
  let x = X;
  return (
    <g>
      <line x1={X} x2={X + W} y1={BASE} y2={BASE} className="stroke-ink/30" />
      {credits.map((c, i) => {
        const width = c * unit;
        const left = x;
        x += width + gap;
        const h = up(figures[`points${i}`]);
        return (
          <g key={i}>
            <motion.rect
              x={left}
              width={width}
              rx={3}
              className="fill-ink"
              initial={false}
              animate={{ y: BASE - (step >= i ? h : 0), height: step >= i ? h : 0, opacity: done ? 0.35 : 1 }}
              transition={SCENE_TRANSITION}
            />
            <motion.text
              x={left + width / 2}
              y={BASE - h - 4}
              textAnchor="middle"
              className="fill-ink text-[9px] font-semibold"
              initial={false}
              animate={{ opacity: step >= i ? 1 : 0 }}
              transition={SCENE_TRANSITION}
            >
              {figures[`points${i}`]}
            </motion.text>
          </g>
        );
      })}
      <motion.g initial={false} animate={{ opacity: done ? 1 : 0 }} transition={SCENE_TRANSITION}>
        <line x1={X} x2={X + W} y1={BASE - up(figures.sgpa)} y2={BASE - up(figures.sgpa)} className="stroke-accent" strokeWidth={2} />
        <text x={X + W} y={BASE - up(figures.sgpa) - 6} textAnchor="end" className="fill-ink text-[11px] font-bold">
          SGPA {figures.sgpa.toFixed(2)}
        </text>
      </motion.g>
    </g>
  );
}
