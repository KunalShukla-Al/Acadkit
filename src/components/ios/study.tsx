import { Link } from "react-router-dom";
import { useSubjects } from "@/hooks/useData";
import { Chevron } from "./bits";
import "./ios.css";

/** Study in iOS idiom: quick links over the subject folders. */
export function StudyApple() {
  const { data: subjects } = useSubjects();

  return (
    <div className="ios-screen">
      <header className="ios-large">
        <div className="date">Notes, PYQs, plans</div>
        <h1>Study</h1>
      </header>

      <div className="ios-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4-4" />
        </svg>
        Search notes, PYQs, units
      </div>

      <section className="ios-sec" aria-labelledby="ios-quick">
        <div className="hd" id="ios-quick"><span>This week</span></div>
        <div className="ios-group">
          <Link className="ios-row has-lead" to="/runup">
            <span className="ios-lead" style={{ background: "hsl(var(--accent))" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            </span>
            <div className="ios-body"><div className="t">Run-up</div><div className="s">your exam plan, day by day</div></div>
            <div className="ios-trail"><Chevron /></div>
          </Link>
          <Link className="ios-row has-lead" to="/deadlines">
            <span className="ios-lead" style={{ background: "hsl(var(--accent-2))" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3 8-8" /><path d="M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11" /></svg>
            </span>
            <div className="ios-body"><div className="t">Deadlines</div><div className="s">what's due and when</div></div>
            <div className="ios-trail"><Chevron /></div>
          </Link>
          <Link className="ios-row has-lead" to="/calendar">
            <span className="ios-lead" style={{ background: "hsl(var(--good-deep))" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
            </span>
            <div className="ios-body"><div className="t">Calendar</div><div className="s">day orders, holidays, exams</div></div>
            <div className="ios-trail"><Chevron /></div>
          </Link>
        </div>
      </section>

      <section className="ios-sec" aria-labelledby="ios-folders">
        <div className="hd" id="ios-folders">
          <span>Subjects</span>
          <span className="ios-val">{subjects?.length ?? 0} folders</span>
        </div>
        <div className="ios-group">
          {(subjects ?? []).length === 0 ? (
            <div className="ios-empty">Your subjects show up here once the semester is set.</div>
          ) : (
            (subjects ?? []).map((s) => (
              <Link className="ios-row has-lead" to={`/subject/${s.code}`} key={s.id}>
                <span className="ios-lead" style={{ background: s.color_hex || "hsl(var(--muted))" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                </span>
                <div className="ios-body">
                  <div className="t">{s.name}</div>
                  <div className="s">{s.code} · {s.credits} credits</div>
                </div>
                <div className="ios-trail"><Chevron /></div>
              </Link>
            ))
          )}
        </div>
      </section>

      <div className="ios-foot">AcadKit · Apple theme</div>
    </div>
  );
}
