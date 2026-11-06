import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useToday } from "@/hooks/useToday";
import { useAttendance, usePortalSnapshots, useSubjects } from "@/hooks/useData";
import { computeOverallAttendance } from "@acadkit/core/attendance";
import { formatDateLong, formatTimeRange, timeToMinutes } from "@acadkit/core/dates";
import { Chevron } from "./bits";
import { attnTone } from "./util";
import "./ios.css";

type SlotPhase = "now" | "next" | "upcoming" | "past";

/**
 * Today in iOS idiom for the Apple theme: the day's classes and an
 * attendance-at-a-glance as inset grouped lists. Same hooks and the same
 * core computations as the default Today; a different design language.
 * Today.tsx picks this when the Apple theme is on.
 */
export function TodayApple() {
  const { date, info, slots, isNextDay } = useToday();
  const { data: attendance } = useAttendance();
  const { data: subjects } = useSubjects();
  const { data: snapshots } = usePortalSnapshots();

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const phases = useMemo(() => {
    const nextIdx = isNextDay
      ? -1
      : slots.findIndex(({ slot }) => nowMin < timeToMinutes(slot.start_time));
    return slots.map(({ slot }, i): SlotPhase => {
      if (isNextDay) return "upcoming";
      if (nowMin > timeToMinutes(slot.end_time)) return "past";
      if (nowMin >= timeToMinutes(slot.start_time)) return "now";
      return i === nextIdx ? "next" : "upcoming";
    });
  }, [slots, nowMin, isNextDay]);

  /** The subjects nearest their attendance bar, worst first. */
  const atRisk = useMemo(() => {
    const overall = computeOverallAttendance(subjects ?? [], attendance ?? [], snapshots ?? []);
    return overall.subjects
      .filter((s) => s.percentage !== null)
      .sort((a, b) => (a.percentage ?? 0) - (b.percentage ?? 0))
      .slice(0, 4);
  }, [subjects, attendance, snapshots]);

  return (
    <div className="ios-screen">
      <header className="ios-large">
        <div className="date">{formatDateLong(date)}</div>
        <h1>{isNextDay ? "Next up" : "Today"}</h1>
      </header>

      <section className="ios-sec" aria-labelledby="ios-today-classes">
        <div className="hd" id="ios-today-classes">
          <span>
            {isNextDay ? "When you're back" : "Classes"}
            {info.dayOrder != null ? ` · Day Order ${info.dayOrder}` : ""}
          </span>
          <Link to="/timetable">Timetable</Link>
        </div>
        <div className="ios-group">
          {slots.length === 0 ? (
            <div className="ios-empty">No classes — enjoy the gap.</div>
          ) : (
            slots.map(({ slot, subject }, i) => {
              const phase = phases[i];
              return (
                <div className="ios-row" key={slot.id}>
                  <div className={`ios-time${phase === "now" ? " is-now" : ""}`}>
                    {formatTimeRange(slot.start_time, slot.end_time).split("–")[0].trim()}
                  </div>
                  <div className="ios-body">
                    <div className={`t${phase === "past" ? " past" : ""}`}>
                      {subject ? subject.name : "Free period"}
                    </div>
                    <div className="s">
                      {slot.room ?? "Room TBA"}
                      {subject?.faculty ? ` · ${subject.faculty}` : ""}
                    </div>
                  </div>
                  <div className="ios-trail">
                    {phase === "now" || phase === "next" ? (
                      <span className="ios-pill">{phase}</span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {atRisk.length > 0 && (
        <section className="ios-sec" aria-labelledby="ios-today-att">
          <div className="hd" id="ios-today-att">
            <span>Attendance</span>
            <Link to="/attendance">See all</Link>
          </div>
          <div className="ios-group">
            {atRisk.map((s) => {
              const pct = Math.round(s.percentage ?? 0);
              const color = `hsl(var(--${attnTone(s.percentage, s.min)}))`;
              return (
                <Link className="ios-row has-lead" to="/attendance" key={s.subject.id}>
                  <span className="ios-dot" style={{ background: color }} />
                  <div className="ios-body">
                    <div className="t">{s.subject.name}</div>
                    <div className="s">
                      {s.canBunk > 0
                        ? `can skip ${s.canBunk} more`
                        : s.needToAttend > 0
                          ? `attend ${s.needToAttend} to reach ${s.min}%`
                          : `at the ${s.min}% line`}
                    </div>
                  </div>
                  <div className="ios-trail">
                    <span className="ios-badge" style={{ color }}>
                      {pct}%
                    </span>
                    <Chevron />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="ios-foot">AcadKit · Apple theme</div>
    </div>
  );
}
