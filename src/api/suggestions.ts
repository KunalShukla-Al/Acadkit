/** What the Mac's scan of the study folder suggests (migration 026), and what was decided. */

import type { Row } from "@/lib/database";
import type { Suggestion, SuggestionStatus } from "@/lib/suggestions";
import { supabase } from "@/lib/supabase";
import { isMissingTable, throwIf } from "@/api/db";

/** The schema can't say that a suggestion's kind decides its payload's shape; the Mac writes them that way (scripts/lib/weekly.mjs). */
const asSuggestions = (rows: Row<"suggestions">[] | null) => (rows ?? []) as Suggestion[];

export async function fetchSuggestions(pin: string): Promise<Suggestion[]> {
  const { data, error } = await supabase
    .from("suggestions")
    .select("*")
    .eq("device_id", pin)
    .eq("status", "pending");
  // Before migration 026 runs the table doesn't exist; that is "nothing
  // suggested", not an error worth a toast on the home screen.
  if (isMissingTable(error)) return [];
  throwIf(error);
  return asSuggestions(data);
}

/**
 * `decidedAt` marks the decision as yours - the suggestion ranker only
 * learns from rows that carry it (src/lib/suggestionModel.ts). It is taken
 * when you tap, not when a queued write finally lands.
 */
export async function setSuggestionStatus(
  id: string,
  status: SuggestionStatus,
  decidedAt: string | null = null
): Promise<void> {
  const { error } = await supabase
    .from("suggestions")
    .update({ status, decided_at: decidedAt })
    .eq("id", id);
  throwIf(error);
}

/** Deadline suggestions you've decided, newest first - what the ranker learns from. */
export async function fetchSuggestionHistory(pin: string): Promise<Suggestion[]> {
  const { data, error } = await supabase
    .from("suggestions")
    .select("*")
    .eq("device_id", pin)
    .eq("kind", "deadline")
    .in("status", ["accepted", "dismissed"])
    .order("created_at", { ascending: false })
    .limit(500);
  if (isMissingTable(error)) return [];
  throwIf(error);
  return asSuggestions(data);
}
