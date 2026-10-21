import { cn } from "@/lib/utils";

/** Nothing to show, said plainly: what isn't there, what to do about it, and at most one way to. No picture. */
export function Empty({
  title,
  detail,
  action,
  className,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("py-10 text-center", className)}>
      <p className="text-sm font-medium">{title}</p>
      {detail && <p className="mx-auto mt-1 max-w-xs text-xs text-muted">{detail}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
