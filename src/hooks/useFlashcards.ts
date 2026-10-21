import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCards } from "@/api/studyFiles";
import { useCardReviews, usePin } from "@/hooks/useData";
import type { CardReview } from "@/lib/flashcards";

/** The flashcards the sync sent, and where each one stands (by card id). */
export function useFlashcards() {
  const pin = usePin();
  const deck = useQuery({
    queryKey: ["cards", pin],
    queryFn: () => fetchCards(pin),
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const reviews = useCardReviews();
  const byId = useMemo(
    () => new Map<string, CardReview>((reviews.data ?? []).map((r) => [r.card_id, r])),
    [reviews.data]
  );
  return { cards: deck.data?.cards ?? [], reviews: byId, loaded: deck.isSuccess && reviews.isSuccess };
}
