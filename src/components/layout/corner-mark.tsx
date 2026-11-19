import type { ReactNode } from "react";

/** What the corner shows (the Day Order, or the close X), in its middle. */
export function CornerMark({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="absolute inset-0 flex items-center justify-center">
      {children}
    </span>
  );
}
