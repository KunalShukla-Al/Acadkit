import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Badge, Dot, EmptyState, Skeleton } from "@/components/ui/misc";
import { SlotSheet } from "@/components/sheets/slot-sheet";
import { TimetableAudit } from "@/components/timetable/timetable-audit";
import { useSubjects, useTimetable } from "@/hooks/useData";
import { useToday } from "@/hooks/useToday";
import { formatTime } from "@acadkit/core/dates";
import { say, VOICE } from "@/lib/voice";
import { useTone } from "@/hooks/useTone";
import { useSwipe } from "@/hooks/useSwipe";
import { slideVariants } from "@/lib/slide";
import { cn, haptic } from "@/lib/utils";
import type { TimetableSlot } from "@acadkit/core/types";

/** +1/-1 for which way to slide when paging between day orders, kept until the next page. */
function useDaySlideDirection(day: number) {
  const [last, setLast] = useState({ day, direction: 0 });
  if (last.day === day) return last.direction;
  const direction = Math.sign(day - last.day);
  setLast({ day, direction });
  return direction;
}

export default function Timetable() {
  const tone = useTone();
  const { data: timetable, isLoading: tLoading } = useTimetable();
  const { data: subjects, isLoading: sLoading } = useSubjects();
  /** Today, not "the day worth showing". */
  const { today } = useToday();

  const [dayOrder, setDayOrder] = useState(today.dayOrder ?? 1);
  // Days 1-5 wrap, because reaching the end and being stuck reads as
  // broken when the control right above you clearly has five options.
  const stepDay = (delta: number) => {
    haptic();
    setDayOrder((d) => ((d - 1 + delta + 5) % 5) + 1);
  };
  const daySwipe = useSwipe(() => stepDay(1), () => stepDay(-1));
  const direction = useDaySlideDirection(dayOrder);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<TimetableSlot | null>(null);

  const slots = useMemo(
    () =>
      (timetable ?? [])
        .filter((s) => s.day_order === dayOrder)
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [timetable, dayOrder]
  );

  // Live clock for now/next highlighting (only when viewing today's order)
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  // A finished day needs no special case: every slot simply reads
  // "past", which is what it is.
  const isToday = today.dayOrder === dayOrder;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const status = (slot: TimetableSlot): "past" | "now" | "upcoming" | "none" => {
    if (!isToday) return "none";
    if (nowMin > toMin(slot.end_time)) return "past";
    if (nowMin >= toMin(slot.start_time)) return "now";
    return "upcoming";
  };
  const nextId = isToday ? slots.find((s) => status(s) === "upcoming")?.id : undefined;

  if (tLoading || sLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="relative space-y-4">
      <h1 className="px-1 text-2xl font-extrabold tracking-tight lg:text-3xl">{say(VOICE.titleTimetable, tone)}</h1>

      <TimetableAudit />

      <Segmented
        layoutId="timetable-day"
        options={[1, 2, 3, 4, 5].map((d) => ({
          value: d,
          label: `Day ${d}`,
          highlight: today.dayOrder === d,
        }))}
        value={dayOrder}
        onChange={setDayOrder}
      />


      <div data-swipe {...daySwipe}>
      <AnimatePresence mode="popLayout" custom={direction} initial={false}>
        {slots.length === 0 ? (
          <motion.div
            key={`empty-${dayOrder}`}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="card"
          >
            <EmptyState
              icon={CalendarPlus}
              title={`Day Order ${dayOrder} is empty`}
              description={say(VOICE.timetableEmptyBody, tone)}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setSheetOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" /> Add first class
                </Button>
              }
            />
          </motion.div>
        ) : (
          <motion.div
            key={`list-${dayOrder}`}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="relative space-y-3"
          >
            {slots.map((slot) => {
              const subject = subjects?.find((s) => s.id === slot.subject_id);
              const isLab = slot.slot_type === "lab";
              const st = status(slot);
              const isNow = st === "now";
              const isNext = slot.id === nextId;
              return (
                <motion.button
                  key={slot.id}
                  layout
                  initial={false}
                  animate={{ x: 0 }}
                  exit={{ opacity: 0, x: 14 }}
                  transition={{ type: "spring", stiffness: 300, damping: 28 }}
                  onClick={() => {
                    setEditing(slot);
                    setSheetOpen(true);
                  }}
                  className={cn(
                    "card relative flex w-full items-center gap-4 p-4 text-left transition-transform active:scale-[0.99]",
                    isNow && "ring-2 ring-accent",
                    isNext && "ring-1 ring-accent/30"
                  )}
                  style={isNow ? { boxShadow: "0 0 0 4px hsl(var(--accent) / 0.12)" } : undefined}
                >
                  <div className="min-w-0 flex-1">
                    {/* A class that's over goes grey, still readable: fading the row took its text under 4.5:1. */}
                    <p className={cn("flex items-start gap-2 font-bold", st === "past" && "text-muted")}>
                      <Dot color={subject?.color_hex ?? "#888"} className={cn("mt-1.5 shrink-0", st === "past" && "opacity-40")} />
                      <span className="line-clamp-2">{subject?.name ?? "Unknown subject"}</span>
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-muted">
                      {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                      {slot.room ? ` · ${slot.room}` : ""}
                    </p>
                  </div>
                  {isNow ? (
                    <Badge className="bg-brand text-brand-ink motion-safe:animate-pulse">now</Badge>
                  ) : isNext ? (
                    <Badge className="bg-accent/15 text-accent-deep">next</Badge>
                  ) : isLab ? (
                    <Badge className="bg-accent-2/15 text-accent-2">lab</Badge>
                  ) : null}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      <Button
        variant="secondary"
        className="w-full"
        onClick={() => {
          setEditing(null);
          setSheetOpen(true);
        }}
      >
        <Plus className="h-4 w-4" /> Add class
      </Button>

      <SlotSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        slot={editing}
        defaultDayOrder={dayOrder}
      />
    </div>
  );
}
