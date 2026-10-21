import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/** A list of rows with hairlines between them and none around. */
export function Rows({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("divide-y", className)}>{children}</div>;
}

/**
 * A row: a title and its detail on the left, a value on the right. With
 * `to` it is a link and with `onClick` a button, both with a chevron;
 * otherwise it only shows.
 */
export function Row({
  title,
  detail,
  value,
  to,
  onClick,
  className,
}: {
  title: React.ReactNode;
  detail?: React.ReactNode;
  value?: React.ReactNode;
  to?: string;
  onClick?: () => void;
  className?: string;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {detail && <span className="mt-0.5 block truncate text-xs text-muted">{detail}</span>}
      </span>
      {value !== undefined && <span className="tabular shrink-0 text-sm text-muted">{value}</span>}
      {(to || onClick) && <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
    </>
  );
  const row = cn("flex w-full items-center gap-3 py-3 text-left", className);
  if (to) return <Link to={to} className={row}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={row}>{body}</button>;
  return <div className={row}>{body}</div>;
}
