import type { ReactNode } from "react";

/** The corner's radius, in px. */
export const CORNER = 64;

/** What the corner shows (the Day Order, or the close X), where its quarter-disc is widest, toward the corner. */
export function CornerMark({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="absolute bottom-[14px] right-[14px] flex h-7 w-7 items-center justify-center">
      {children}
    </span>
  );
}
