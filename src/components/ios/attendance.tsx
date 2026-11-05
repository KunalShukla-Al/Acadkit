import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAttendance, usePortalSnapshots, useSubjects } from "@/hooks/useData";
import { computeOverallAttendance } from "@acadkit/core/attendance";
import { Chevron } from "./bits";
import { attnTone } from "./util";
import "./ios.css";

const R = 15;
const CIRC = 2 * Math.PI * R;

/** Attendance in iOS idiom: a summary ring over per-subject rows, worst first. */
export function AttendanceApple() {
  const { data: subjects } = useSubjects();
  const { data: attendance } = useAttendance();
  const { data: snapshots } = usePortalSnapshots();

  const overall = useMemo(
    () => computeOverallAttendance(subjects ?? [], attendance ?? [], snapshots ?? []),
    [subjects, attendance, snapshots]
  );
  const rows = useMemo(
    () =>
      overall.subjects
        .filter((s) => s.percentage !== null)
        .sort((a, b) => (a.percentage ?? 0) - (b.percentage ?? 0)),
    [overall.subjects]
  );

  const pct = overall.percentage;
  const ringColor = `hsl(var(--${attnTone(pct, 75)}))`;
  const offset = pct === null ? CIRC : CIRC * (1 - Math.min(pct, 100) / 100);

  return (
    <div className="ios-screen">
      <header className="ios-large">
        <div className="date">Semester</div>
        <h1>Attendance</h1>
      </header>

      <section className="ios-sec">
        <div className="ios-hero">
          <svg className="ios-ring" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <circle className="track" cx="18" cy="18" r={R} strokeWidth="4" />
            <circle
              className="val"
              cx="18"
              cy="18"
              r={R}
              strokeWidth="4"
              stroke={ringColor}
              strokeDasharray={CIRC}
              strokeDashoffset={offset}
              transform="rotate(-90 18 18)"
            />
          </svg>
          <div className="grow">
            <div className="big">{pct === null ? "—" : `${Math.round(pct)}%`}</div>
            <div className="cap">
              {overall.total > 0
                ? `${overall.attended} of ${overall.total} classes · 75% needed`
                : "No classes recorded yet"}
            </div>
          </div>
        </div>
      </section>

      <section className="ios-sec" aria-labelledby="ios-att">
        <div className="hd" id="ios-att">
          <span>By subject</span>
          <Link to="/skips">Plan skips</Link>
        </div>
        <div className="ios-group">
          {rows.length === 0 ? (
            <div className="ios-empty">Mark a few classes to see your standing.</div>
          ) : (
            rows.map((s) => {
              const sp = Math.round(s.percentage ?? 0);
              const color = `hsl(var(--${attnTone(s.percentage, s.min)}))`;
              return (
                <Link className="ios-row has-lead" to="/skips" key={s.subject.id}>
                  <span className="ios-dot" style={{ background: color }} />
                  <div className="ios-body">
                    <div className="t">{s.subject.name}</div>
                    <div className="s">
                      {s.canBunk > 0
                        ? `can skip ${s.canBunk} more · ${s.attended}/${s.total}`
                        : s.needToAttend > 0
                          ? `attend ${s.needToAttend} to reach ${s.min}%`
                          : `at the ${s.min}% line · ${s.attended}/${s.total}`}
                    </div>
                  </div>
                  <div className="ios-trail">
                    <span className="ios-badge" style={{ color }}>
                      {sp}%
                    </span>
                    <Chevron />
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </section>

      <div className="ios-foot">AcadKit · Apple theme</div>
    </div>
  );
}
