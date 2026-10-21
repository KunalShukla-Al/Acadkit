import { motion } from "motion/react";
import type { SceneProps } from "@/components/explainer/player";
import { SCENE_TRANSITION, STAGE } from "@/lib/explainer";

const PAD = 16;
const GAP = 6;

/**
 * dayWorking (src/lib/survival.ts) as a scene: the day's classes as
 * blocks, each coloured in as its step comes (needed, or one you can
 * miss); the last step says whether the day is free.
 */
export function DayScene({ figures, step, count }: SceneProps) {
  const n = figures.classes;
  const w = (STAGE.width - 2 * PAD - (n - 1) * GAP) / Math.max(1, n);
  const last = step >= count - 1;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const needed = figures[`class${i}`] === 1;
        const shown = step >= i;
        return (
          <g key={i}>
            <motion.rect
              x={PAD + i * (w + GAP)}
              y={56}
              width={w}
              height={44}
              rx={8}
              className={!shown ? "fill-ink/10" : needed ? "fill-ink" : "fill-good/25"}
              initial={false}
              animate={{ opacity: shown ? 1 : 0.6 }}
              transition={SCENE_TRANSITION}
            />
            <motion.text
              x={PAD + i * (w + GAP) + w / 2}
              y={82}
              textAnchor="middle"
              className={needed ? "fill-bg text-[9px] font-semibold" : "fill-good-deep text-[9px] font-semibold"}
              initial={false}
              animate={{ opacity: shown ? 1 : 0 }}
              transition={SCENE_TRANSITION}
            >
              {needed ? "needed" : "can miss"}
            </motion.text>
          </g>
        );
      })}
      <motion.text
        x={STAGE.width / 2}
        y={136}
        textAnchor="middle"
        className="fill-ink text-[14px] font-bold"
        initial={false}
        animate={{ opacity: last ? 1 : 0 }}
        transition={SCENE_TRANSITION}
      >
        {figures.required ? `${figures.required} needed: not a day off` : "A day off"}
      </motion.text>
    </g>
  );
}
