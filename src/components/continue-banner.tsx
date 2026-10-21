import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronRight, Laptop, Smartphone } from "lucide-react";
import { fetchReading } from "@/api/reading";
import { usePin } from "@/hooks/useData";
import { useViewerLinkState } from "@/hooks/useViewerLink";
import { continueOffer, deviceKind } from "@/lib/reading";
import { viewerHref } from "@/lib/viewer";

/** "Continue Unit3_CPU_Scheduling_Slides at p. 24 · from your phone": a page you were reading on your other device, opened here at it. */
export function ContinueBanner() {
  const pin = usePin();
  const { data } = useQuery({ queryKey: ["reading", pin], queryFn: () => fetchReading(pin), staleTime: 60_000 });
  const viewerState = useViewerLinkState();
  const offer = continueOffer(data ?? null, { kind: deviceKind() });
  if (!offer) return null;
  const name = offer.path.slice(offer.path.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
  const Icon = offer.kind === "phone" ? Smartphone : Laptop;
  return (
    <Link to={viewerHref(offer.path, offer.page)} state={viewerState} className="card flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
      <Icon className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">
          Continue {name}
          {offer.page ? ` at p. ${offer.page}` : ""}
        </span>
        <span className="text-muted"> · from your {offer.kind}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
    </Link>
  );
}
