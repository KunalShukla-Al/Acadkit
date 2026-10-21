import { motion } from "motion/react";
import type { SceneProps } from "@/components/explainer/player";
import { classesPerSquare, SCENE_TRANSITION, STAGE } from "@/lib/explainer";

const COLS = 30;
const SIDE = 8;
const GAP = 1.6;
const BAR = { x: 16, y: 128, w: STAGE.width - 32, h: 12 };

/**
 * attendanceWorking (packages/core/src/attendance.ts) as a scene: the
 * classes as squares, attended ones filled; then a bar that fills to the
 * percentage; then the subject's bar marked on it, and the gap to it.
 * Its last two steps are the percentage and the bar; the ones before
 * count the classes.
 */
export function AttendanceScene({ figures, step, count }: SceneProps) {
  const { attended, total, percentage, min } = figures;
  const per = classesPerSquare(total);
  const squares = Math.ceil(total / per);
  const filled = Math.round(attended / per);
  const showPct = step >= count - 2;
  const showMin = step >= count - 1;
  const width = (BAR.w * percentage) / 100;
  const minX = BAR.x + (BAR.w * min) / 100;
  const above = percentage >= min;
  const gridWidth = Math.min(squares, COLS) * (SIDE + GAP);
  const x0 = (STAGE.width - gridWidth) / 2;
  if (total === 0)
    return (
      <text x={STAGE.width / 2} y={STAGE.height / 2} textAnchor="middle" className="fill-muted text-[11px]">
        No classes yet
      </text>
    );
  return (
    <g>
      {Array.from({ length: squares }, (_, i) => (
        <motion.rect
          key={i}
          x={x0 + (i % COLS) * (SIDE + GAP)}
          y={30 + Math.floor(i / COLS) * (SIDE + GAP)}
          width={SIDE}
          height={SIDE}
          rx={1.5}
          className={i < filled ? "fill-ink" : "fill-ink/15"}
          initial={false}
          animate={{ opacity: showPct ? 0.35 : 1 }}
          transition={SCENE_TRANSITION}
        />
      ))}
      <text x={STAGE.width / 2} y={20} textAnchor="middle" className="fill-muted text-[9px]">
        {attended} of {total} classes{per > 1 ? ` · each square is ${per}` : ""}
      </text>
      <rect x={BAR.x} y={BAR.y} width={BAR.w} height={BAR.h} rx={6} className="fill-ink/10" />
      <motion.rect
        x={BAR.x}
        y={BAR.y}
        height={BAR.h}
        rx={6}
        className={showMin ? (above ? "fill-good" : "fill-bad") : "fill-ink"}
        initial={false}
        animate={{ width: showPct ? width : 0 }}
        transition={SCENE_TRANSITION}
      />
      <motion.text
        y={BAR.y - 6}
        textAnchor="middle"
        className="fill-ink text-[11px] font-bold"
        initial={false}
        animate={{ x: BAR.x + (showPct ? width : 0), opacity: showPct ? 1 : 0 }}
        transition={SCENE_TRANSITION}
      >
        {percentage.toFixed(1)}%
      </motion.text>
      <motion.g initial={false} animate={{ opacity: showMin ? 1 : 0 }} transition={SCENE_TRANSITION}>
        <line x1={minX} x2={minX} y1={BAR.y - 4} y2={BAR.y + BAR.h + 4} className="stroke-ink" strokeWidth={1.5} />
        <text x={minX} y={BAR.y + BAR.h + 16} textAnchor="middle" className="fill-muted text-[9px]">
          bar {min}%
        </text>
      </motion.g>
    </g>
  );
}
