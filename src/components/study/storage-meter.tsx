import { baseName, formatSize, storageLevel, type StorageData } from "@/lib/studyFiles";
import { cn } from "@/lib/utils";

const BAR = { ok: "bg-accent", high: "bg-warn", full: "bg-bad" } as const;

/** How much of the free plan's 1 GB the study folder takes, as the Mac's last sync measured it. */
export function StorageMeter({ storage }: { storage: StorageData }) {
  const level = storageLevel(storage);
  const label = `${formatSize(storage.used)} of ${formatSize(storage.limit)}`;
  const refused = storage.refused;
  return (
    <div className="px-1">
      <div className="flex items-baseline justify-between gap-3 text-xs font-semibold text-muted">
        <span>Storage</span>
        <span className="tabular">{label}</span>
      </div>
      <div
        role="meter"
        aria-label="Storage used"
        aria-valuemin={0}
        aria-valuemax={storage.limit}
        aria-valuenow={storage.used}
        aria-valuetext={label}
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"
      >
        <div className={cn("h-full rounded-full", BAR[level])} style={{ width: `${Math.min(100, (storage.used / storage.limit) * 100)}%` }} />
      </div>
      {refused.length > 0 && (
        <p className="mt-1.5 text-xs font-medium text-bad-deep">
          {refused.length === 1 ? `${baseName(refused[0].path)} didn't fit` : `${refused.length} files didn't fit`}, so{" "}
          {refused.length === 1 ? "it isn't" : "they aren't"} here yet. Delete something to make room.
        </p>
      )}
      {!refused.length && level === "high" && (
        <p className="mt-1.5 text-xs font-medium text-warn-deep">Nearly full: the Mac stops uploading at {formatSize(storage.cap)}.</p>
      )}
    </div>
  );
}
