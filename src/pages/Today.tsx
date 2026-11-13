import { GettingStartedCard } from "@/components/getting-started";
import { Greeting } from "@/components/home/greeting";
import { TodayCard } from "@/components/home/today-card";
import { DeadlinesCard } from "@/components/home/deadlines-card";
import { ExamCountdown } from "@/components/viz/exam-countdown";
import { SuggestionsCard } from "@/components/viz/suggestions-card";
import { ContinueBanner } from "@/components/continue-banner";

/**
 * The first tab: a greeting, the next thing that carries marks, the day's
 * classes, then what's due. Above them only what needs you (a suggestion
 * to accept, a page to continue), each saying nothing when there's nothing.
 */
export default function Today() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Greeting />
      <SuggestionsCard />
      <ContinueBanner />
      <GettingStartedCard />
      <ExamCountdown />
      <TodayCard />
      <DeadlinesCard preview />
    </div>
  );
}
