import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useSurvivalInputsSettled, useSurvivalPlan } from "@/hooks/useSurvivalPlan";
import { useTone } from "@/hooks/useTone";
import { todayISO } from "@acadkit/core/dates";
import { freeDayLoss, type FreeDayMark } from "@/lib/freeDays";
import { say, VOICE } from "@/lib/voice";

/** Tells you when an absence just cost you a day off. */
export function useFreeDayWatch() {
  const plan = useSurvivalPlan();
  const settled = useSurvivalInputsSettled();
  const tone = useTone();

  const previous = useRef<FreeDayMark | null>(null);

  useEffect(() => {
    // A plan made before attendance or the portal totals arrive has days off that aren't real.
    if (!plan || !settled) return;
    const now: FreeDayMark = { count: plan.freeDays.length, date: todayISO() };
    const lost = freeDayLoss(previous.current, now);
    previous.current = now;
    if (lost === null) return;

    toast(say(VOICE.freeDaySpent, tone, lost), {
      description: say(VOICE.freeDayLeft, tone, now.count),
    });
  }, [plan, settled, tone]);
}
