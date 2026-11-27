import { NotebookPen } from "lucide-react";
import { EmptyState, Skeleton } from "@/components/ui/misc";

export function DeskLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** No desk data: not synced yet, or it couldn't load. */
export function DeskEmpty({ error = false }: { error?: boolean }) {
  return (
    <section className="card mx-auto max-w-3xl">
      <EmptyState
        icon={NotebookPen}
        title={error ? "Couldn't load the Desk" : "No desk data yet"}
        description={
          error
            ? "Check your connection. A course you've opened once shows here offline."
            : "It comes from your study folders (_src/acadkit_desk.json) at the next sync."
        }
        className="py-10"
      />
    </section>
  );
}
