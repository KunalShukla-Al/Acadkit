import { useMemo } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Link2 } from "lucide-react";
import { useLectures } from "@/hooks/useLectures";
import { useLinks } from "@/hooks/useLinks";
import { useViewerLinkState } from "@/hooks/useViewerLink";
import { chipLabel, hrefOf, linksFor, type Link } from "@/lib/connected";
import { cn } from "@/lib/utils";

const SHOWN = 6;

/**
 * "Connected" and a chip for each item linked to this one (scripts/lib/links.mjs):
 * what was said in class then, the slides and notes about the same thing,
 * the past papers that asked it. Each chip opens its item, over the page
 * it was opened from. `ids` are the item's ids in `course`; `hide` leaves
 * out links the place already shows. Nothing without links.
 */
export function ConnectedLine({ course, ids, hide, className }: { course: string | null; ids: string[]; hide?: (l: Link) => boolean; className?: string }) {
  const part = useLinks(course);
  const { data: lectures } = useLectures();
  const byMemo = useMemo(() => new Map((lectures ?? []).map((l) => [l.memo, l.id])), [lectures]);
  const viewerState = useViewerLinkState();
  const links = linksFor(part, ids).filter((l) => !hide?.(l));
  if (!part || links.length === 0) return null;
  const chip = "shrink-0 rounded-full bg-surface-2 px-2.5 py-1 font-semibold text-ink";
  return (
    <div className={cn("flex min-w-0 items-center gap-2 overflow-x-auto text-xs", className)} aria-label="Connected">
      <span className="flex shrink-0 items-center gap-1 font-bold uppercase tracking-widest text-muted">
        <Link2 className="h-3 w-3" aria-hidden /> Connected
      </span>
      {links.slice(0, SHOWN).map((l) => {
        const href = hrefOf(l, part, byMemo);
        return href ? (
          <RouterLink key={l.id} to={href} state={viewerState} className={cn(chip, "hover:bg-accent/15")}>
            {chipLabel(l, part)}
          </RouterLink>
        ) : (
          <span key={l.id} className={chip}>
            {chipLabel(l, part)}
          </span>
        );
      })}
      {links.length > SHOWN && <span className="shrink-0 font-semibold text-muted">+{links.length - SHOWN}</span>}
    </div>
  );
}
