import { DeadlinesCard } from "@/components/home/deadlines-card";
import { ExamCountdown } from "@/components/viz/exam-countdown";

/** Every deadline, under the next exam: what Today's list opens. */
export default function Deadlines() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="px-1 text-2xl font-extrabold tracking-tight lg:text-3xl">Deadlines</h1>
      <ExamCountdown />
      <DeadlinesCard />
    </div>
  );
}
