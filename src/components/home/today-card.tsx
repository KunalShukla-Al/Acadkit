import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, BadgeCheck, Ban, CalendarCheck2, Check, Clock3, PartyPopper, Sunrise, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Dot, EmptyState } from "@/components/ui/misc";
import { useAttendance, useDeadlines, useSettings, useSubjects, useTimetable } from "@/hooks/useData";
import { useToday } from "@/hooks/useToday";
import { daysUntilSemesterStart, nextWorkingDate, semesterWindow } from "@acadkit/core/calendar";
import { formatDate, formatDateLong, formatTimeRange, timeToMinutes } from "@acadkit/core/dates";
import { say, VOICE } from "@/lib/voice";
import { useTone } from "@/hooks/useTone";
import { LiveClassCard } from "@/components/viz/live-class";
import { nextExam } from "@/lib/examCountdown";
import { subjectShort } from "@acadkit/core/subjectShort";
import { cn } from "@/lib/utils";
import type { TimetableSlot } from "@acadkit/core/types";

/** The day: its classes, now and next, or the day you're back. */
export function TodayCard() {
  const tone = useTone();
  const { date, info, slots, isNextDay, declared } = useToday();
  const { data: attendance } = useAttendance();
  const { data: settings } = useSettings();
  const { data: timetable } = useTimetable();
  // Every deadline, end-sems included: the lists leave those out, and they're what's left once teaching ends.
  const { data: deadlines } = useDeadlines();
  const { data: subjects } = useSubjects();

  /** The day you come back, and what is waiting on it. */
  const returning = useMemo(() => {
    if (info.kind !== "official-holiday" && info.kind !== "declared-holiday") return null;
    const next = nextWorkingDate(date, declared, semesterWindow(settings));
    if (!next) return null;
    const classes = (timetable ?? []).filter((t) => t.day_order === next.dayOrder).length;
    return { ...next, classes };
  }, [info.kind, date, declared, settings, timetable]);

  // Live clock for now/next/past styling
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  /** The next exam, said the way Siri says it: "TBVP End-sem is tomorrow". */
  const exam = useMemo(() => {
    const next = nextExam(deadlines, now);
    if (!next) return null;
    const subject = subjects?.find((s) => s.id === next.deadline.subject_id);
    const when = next.daysAway === 0 ? "today" : next.daysAway === 1 ? "tomorrow" : `in ${next.daysAway} days`;
    return `${subject ? `${subjectShort(subject)} ` : ""}${next.deadline.title} is ${when}`;
  }, [deadlines, subjects, now]);
  /** What attendance says about one of today's slots, if anything. */
  const statusOfSlot = (slot: TimetableSlot) =>
    attendance?.find(
      (r) =>
        r.subject_id === slot.subject_id && r.date === date && r.start_time === slot.start_time
    )?.status ?? null;
  // Once we've rolled over to the next day's schedule, none of its slots
  // have happened yet - minute-of-day comparisons against "now" no longer apply.
  const statusOf = (start: string, end: string) =>
    isNextDay
      ? "upcoming"
      : nowMin > timeToMinutes(end)
        ? "past"
        : nowMin >= timeToMinutes(start)
          ? "now"
          : "upcoming";
  // "Next" skips anything cancelled, for the same reason the live card
  // does: a class that isn't happening isn't the one coming up.
  const nextId = isNextDay
    ? undefined
    : slots.find(
        ({ slot }) =>
          statusOf(slot.start_time, slot.end_time) === "upcoming" &&
          statusOfSlot(slot) !== "holiday"
      )?.slot.id;

  return (
    <section className="card overflow-hidden">
      <div className="border-b px-5 py-4">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">
          {isNextDay ? "Up next" : "Today"}
        </p>
        <h2 className="mt-0.5 text-lg font-extrabold">{formatDateLong(date)}</h2>
      </div>


      <LiveClassCard
        slots={slots}
        nowMinutes={nowMin}
        disabled={isNextDay}
        statusFor={({ slot }) => statusOfSlot(slot)}
      />

      {/* Removing the swipe made auto-marking the only thing writing attendance from this screen, so it has to be obvious when it is off. */}
      {settings && settings.auto_mark_present !== true && !isNextDay && (
        <Link
          to="/settings"
          className="mx-4 mt-3 flex items-start gap-2 rounded-2xl border border-warn/25 bg-warn/10 p-3 text-xs font-semibold"
        >
          <CalendarCheck2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Attendance isn't being marked automatically. Turn on{" "}
            <b>auto-mark present</b> in Settings, and correct the days you missed from the
            Calendar.
          </span>
        </Link>
      )}

      <div className="p-4">
        {info.kind === "pre-semester" ? (
          <EmptyState
            icon={Sunrise}
            title={`Semester starts in ${daysUntilSemesterStart(date, semesterWindow(settings))} days`}
            description="Set up your timetable now so day one is effortless."
            action={
              <Button variant="secondary" size="sm">
                <Link to="/timetable" className="flex items-center gap-1.5">
                  Build timetable <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            }
          />
        ) : info.kind === "weekend" ? (
          <EmptyState icon={PartyPopper} title="It's the weekend" description="No day order today. Recharge." />
        ) : info.kind === "official-holiday" || info.kind === "declared-holiday" ? (
          <section className="card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-[0.22em] opacity-80">holiday</p>
                <p className="mt-1 text-3xl font-extrabold leading-[1.1]">
                  {info.holidayName ?? "Holiday"}
                </p>
                <p className="mt-1.5 text-sm font-semibold opacity-90">
                  {say(VOICE.noClassesToday, tone)}
                </p>
              </div>
              <PartyPopper className="h-9 w-9 shrink-0 opacity-40" strokeWidth={1.6} />
            </div>

            {/* What the block was missing: somewhere to look next. A flat
                panel naming the holiday tells you something you already
                knew by the time you opened the app. */}
            {returning && (
              <>
                <div aria-hidden className="my-4 h-px bg-current opacity-20" />
                {/* Two atomic chunks rather than five inline spans: with
                    separators between every part, a wrap left a dangling
                    "·" at the end of the line. */}
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm font-bold">
                  <span>
                    <span className="opacity-70">{say(VOICE.holidayBack, tone)} </span>
                    {formatDate(returning.date, { weekday: "long", day: "numeric", month: "short" })}
                  </span>
                  <span>
                    Day {returning.dayOrder}
                    {returning.classes > 0 && (
                      <span className="opacity-70">
                        {" · "}
                        {say(VOICE.holidayThen, tone, returning.classes)}
                      </span>
                    )}
                  </span>
                </div>
              </>
            )}
          </section>
        ) : info.kind === "post-semester" ? (
          // Teaching ends before the end-sems do: while one is still ahead, the semester isn't over.
          exam ? (
            <EmptyState icon={PartyPopper} title="Classes are over" description={exam} />
          ) : (
            <EmptyState icon={PartyPopper} title="Semester's over" description="See you next term." />
          )
        ) : slots.length === 0 ? (
          <EmptyState
            icon={Clock3}
            title={`Nothing scheduled for Day Order ${info.dayOrder}`}
            description="Add your classes for this day order in the Timetable tab."
            action={
              <Button variant="secondary" size="sm">
                <Link to="/timetable" className="flex items-center gap-1.5">
                  Add classes <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {slots.map(({ slot, subject }) => {
              const st = statusOf(slot.start_time, slot.end_time);
              const isNow = st === "now";
              const isNext = slot.id === nextId;
              const record = attendance?.find(
                (r) =>
                  r.subject_id === slot.subject_id &&
                  r.date === date &&
                  r.start_time === slot.start_time
              );
              return (
                // Read-only.
                <motion.div
                  key={slot.id}
                  layout
                  initial={false}
                  animate={{ y: 0 }}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-2xl border bg-surface-2/40 p-3",
                    isNow && "ring-2 ring-accent",
                    isNext && "ring-1 ring-accent/30"
                  )}
                  style={isNow ? { boxShadow: "0 0 0 4px hsl(var(--accent) / 0.12)" } : undefined}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {/* A class that's over goes grey, still readable: fading the row took its text under 4.5:1. */}
                    <Dot color={subject?.color_hex ?? "#888"} className={cn(st === "past" && "opacity-40")} />
                    <div className="min-w-0">
                      <p className={cn("line-clamp-2 text-sm font-bold", st === "past" && "text-muted")}>
                        {subject?.name ?? "Unknown subject"}
                      </p>
                      <p className="truncate text-xs font-medium text-muted">
                        {slot.slot_type === "lab" ? "Lab · " : ""}
                        {formatTimeRange(slot.start_time, slot.end_time)}
                        {slot.room ? ` · ${slot.room}` : ""}
                      </p>
                    </div>
                  </div>
                  {record?.status === "present" ? (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-good/15 text-good-deep">
                      <Check className="h-4 w-4" strokeWidth={2.6} />
                    </span>
                  ) : record?.status === "absent" ? (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-bad/15 text-bad-deep">
                      <X className="h-4 w-4" strokeWidth={2.6} />
                    </span>
                  ) : record?.status === "od" ? (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-good/10 text-good-deep ring-1 ring-inset ring-good/40">
                      <BadgeCheck className="h-4 w-4" strokeWidth={2.6} />
                    </span>
                  ) : record?.status === "holiday" ? (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
                      <Ban className="h-4 w-4" />
                    </span>
                  ) : isNow ? (
                    <Badge className="bg-brand text-brand-ink motion-safe:animate-pulse">now</Badge>
                  ) : isNext ? (
                    <Badge className="bg-accent/15 text-accent-deep">next</Badge>
                  ) : null}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

