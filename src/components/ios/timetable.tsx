import { useMemo, useState } from "react";
import { useSubjects, useTimetable } from "@/hooks/useData";
import { useToday } from "@/hooks/useToday";
import { formatTime } from "@acadkit/core/dates";
import "./ios.css";

const DAYS = [1, 2, 3, 4, 5];

/** The week in iOS idiom: a day-order selector over an inset list of classes. */
export function TimetableApple() {
  const { data: timetable } = useTimetable();
  const { data: subjects } = useSubjects();
  const { today } = useToday();
  const [dayOrder, setDayOrder] = useState(today.dayOrder ?? 1);

  const rows = useMemo(() => {
    if (!timetable) return [];
    return timetable
      .filter((s) => s.day_order === dayOrder)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((slot) => ({ slot, subject: subjects?.find((s) => s.id === slot.subject_id) }));
  }, [timetable, subjects, dayOrder]);

  return (
    <div className="ios-screen">
      <header className="ios-large">
        <div className="date">This week</div>
        <h1>Timetable</h1>
      </header>

      <div className="ios-days" role="group" aria-label="Day order">
        {DAYS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={d === dayOrder}
            onClick={() => setDayOrder(d)}
          >
            DO {d}
          </button>
        ))}
      </div>

      <section className="ios-sec" aria-labelledby="ios-tt">
        <div className="hd" id="ios-tt">
          <span>Day Order {dayOrder}</span>
          <span className="ios-val">
            {rows.length} {rows.length === 1 ? "class" : "classes"}
          </span>
        </div>
        <div className="ios-group">
          {rows.length === 0 ? (
            <div className="ios-empty">No classes on this day order.</div>
          ) : (
            rows.map(({ slot, subject }) => (
              <div className="ios-row has-lead" key={slot.id}>
                <div className="ios-time">{formatTime(slot.start_time)}</div>
                <span
                  className="ios-dot"
                  style={{ background: subject?.color_hex ?? "hsl(var(--muted))" }}
                />
                <div className="ios-body">
                  <div className="t">{subject ? subject.name : "Free period"}</div>
                  <div className="s">
                    {slot.room ?? "Room TBA"}
                    {subject?.faculty ? ` · ${subject.faculty}` : ""}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <div className="ios-foot">AcadKit · Apple theme</div>
    </div>
  );
}
