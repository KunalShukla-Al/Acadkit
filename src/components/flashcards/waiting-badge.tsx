import { useMemo } from "react";
import { useFlashcards } from "@/hooks/useFlashcards";
import { useTodayISO } from "@/hooks/useRunup";
import { waitingCount } from "@/lib/flashcards";

/** The cards waiting today, as a count on the ball's Flashcards; nothing when none wait. */
export function WaitingBadge() {
  const { cards, reviews, loaded } = useFlashcards();
  const today = useTodayISO();
  const waiting = useMemo(() => waitingCount(cards, reviews, today), [cards, reviews, today]);
  if (!loaded || waiting === 0) return null;
  return (
    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-2 px-1.5 text-[11px] font-extrabold text-brand-ink tabular ring-2 ring-bg">
      {waiting}
    </span>
  );
}
