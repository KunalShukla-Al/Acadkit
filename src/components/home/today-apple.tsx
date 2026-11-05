import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useToday } from "@/hooks/useToday";
import { useAttendance, useSubjects } from "@/hooks/useData";
import { formatDateLong, formatTimeRange, timeToMinutes } from "@acadkit/core/dates";
import { subjectShort } from "@acadkit/core/subjectShort";
import "./today-apple.css";

type SlotPhase = "now" | "next" | "upcoming" | "past";

/** A subject's attendance standing, worst first. */
interface Standing {
  id: string;
  name: string;
  pct: number;
  bar: number;
}

/**
 * Today in iOS idiom for the Apple theme: the day's classes and an
 * attendance-at-a-glance, as inset grouped lists. Same hooks as the
 * default Today, a different design language. Today.tsx picks this when
 * the Apple theme is on.
 */
export function TodayApple() {
  const { date, info, slots, isNextDay } = useToday();
  const { data: attendance } = useAttendance();
  const { data: subjects } = useSubjects();

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  /** Each slot's phase; the first still-upcoming one is "next". */
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

  /** Attendance percent per subject, worst standing first. */
  const standings = useMemo<Standing[]>(() => {
    if (!attendance || !subjects) return [];
    const tally = new Map<string, { held: number; present: number }>();
    for (const r of attendance) {
      if (r.status === "holiday") continue;
      const e = tally.get(r.subject_id) ?? { held: 0, present: 0 };
      e.held += 1;
      if (r.status === "present" || r.status === "od") e.present += 1;
      tally.set(r.subject_id, e);
    }
    return subjects
      .map((s): Standing | null => {
        const t = tally.get(s.id);
        if (!t || t.held === 0) return null;
        return {
          id: s.id,
          name: subjectShort(s),
          pct: Math.round((t.present / t.held) * 100),
          bar: s.medical_leave ? 65 : 75,
        };
      })
      .filter((s): s is Standing => s !== null)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 6);
  }, [attendance, subjects]);

  const title = isNextDay ? "Next up" : "Today";
  const dayOrder = info.dayOrder;

  return (
    <div className="ios-today">
      <header className="ios-large">
        <div className="date">{formatDateLong(date)}</div>
        <h1>{title}</h1>
      </header>

      <section className="ios-sec" aria-labelledby="ios-classes">
        <div className="hd" id="ios-classes">
          <span>
            {isNextDay ? "When you're back" : "Classes"}
            {dayOrder != null ? ` · Day Order ${dayOrder}` : ""}
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
                    {phase === "now" ? (
                      <span className="ios-pill">now</span>
                    ) : phase === "next" ? (
                      <span className="ios-pill">next</span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {standings.length > 0 && (
        <section className="ios-sec" aria-labelledby="ios-att">
          <div className="hd" id="ios-att">
            <span>Attendance</span>
            <Link to="/attendance">See all</Link>
          </div>
          <div className="ios-group">
            {standings.map((s) => {
              const tone =
                s.pct >= s.bar ? "good-deep" : s.pct >= s.bar - 10 ? "warn-deep" : "bad-deep";
              return (
                <div className="ios-row has-lead" key={s.id}>
                  <span className="ios-dot" style={{ background: `hsl(var(--${tone}))` }} />
                  <div className="ios-body">
                    <div className="t">{s.name}</div>
                    <div className="s">
                      {s.pct >= s.bar ? `${s.pct - s.bar}% clear of the ${s.bar}% bar` : `below the ${s.bar}% bar`}
                    </div>
                  </div>
                  <div className="ios-trail">
                    <span className="ios-badge" style={{ color: `hsl(var(--${tone}))` }}>
                      {s.pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="ios-foot">AcadKit · Apple theme</div>
    </div>
  );
}
