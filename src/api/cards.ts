/** Flashcard reviews: where each card stands (migration 045). */

import type { CardReview } from "@/lib/flashcards";
import { supabase } from "@/lib/supabase";
import { isMissingTable, throwIf } from "@/api/db";

/** Where each flashcard stands. A project that hasn't run 045 has none, so every card starts new. */
export async function fetchCardReviews(pin: string): Promise<CardReview[]> {
  const { data, error } = await supabase.from("card_reviews").select("card_id, box, due, reviewed_at").eq("device_id", pin);
  if (isMissingTable(error)) return [];
  throwIf(error);
  return data ?? [];
}

/** One review: the card's new box and due day replace its old ones. */
export async function saveCardReview(pin: string, v: CardReview): Promise<void> {
  const { error } = await supabase.from("card_reviews").upsert({ device_id: pin, ...v }, { onConflict: "device_id,card_id" });
  throwIf(error);
}
