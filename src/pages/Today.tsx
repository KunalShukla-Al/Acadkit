import { GettingStartedCard } from "@/components/getting-started";
import { Greeting } from "@/components/home/greeting";
import { TodayCard } from "@/components/home/today-card";
import { DeadlinesCard } from "@/components/home/deadlines-card";
import { SuggestionsCard } from "@/components/viz/suggestions-card";
import { SiriLine } from "@/components/siri-line";
import { AutopilotLine } from "@/components/autopilot-line";
import { ContinueBanner } from "@/components/continue-banner";

/**
 * The first tab: a greeting, the day's classes, then what's due. Above
 * the day only what needs you (a suggestion to accept, a page to
 * continue, an undo), each saying nothing when there's nothing.
 */
export default function Today() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Greeting />
      <SuggestionsCard />
      <ContinueBanner />
      <SiriLine />
      <AutopilotLine />
      <GettingStartedCard />
      <TodayCard />
      <DeadlinesCard preview />
    </div>
  );
}
