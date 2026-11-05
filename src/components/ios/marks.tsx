import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useMarks, useSubjects } from "@/hooks/useData";
import { computeSgpa } from "@acadkit/core/plan";
import { groupMarksBySubject, GRADE_COLORS } from "@acadkit/core/grades";
import { Chevron } from "./bits";
import "./ios.css";

/** Marks in iOS idiom: a projected-SGPA card over per-subject rows with grade badges. */
export function MarksApple() {
  const { data: subjects } = useSubjects();
  const { data: marks } = useMarks();

  const result = useMemo(
    () => computeSgpa(subjects ?? [], groupMarksBySubject(marks ?? [])),
    [subjects, marks]
  );

  return (
    <div className="ios-screen">
      <header className="ios-large">
        <div className="date">Semester</div>
        <h1>Marks</h1>
      </header>

      <section className="ios-sec">
        <div className="ios-hero">
          <div className="grow">
            <div className="big">{result.sgpa === null ? "—" : result.sgpa.toFixed(2)}</div>
            <div className="cap">
              Projected SGPA · {result.countedSubjects} of {subjects?.length ?? 0} subjects counted
            </div>
          </div>
        </div>
      </section>

      <section className="ios-sec" aria-labelledby="ios-marks">
        <div className="hd" id="ios-marks">
          <span>By subject</span>
          <span className="ios-val">internal /60</span>
        </div>
        <div className="ios-group">
          {result.rows.length === 0 ? (
            <div className="ios-empty">Add your test marks to see where you stand.</div>
          ) : (
            result.rows.map(({ subject, marks: o }) => {
              const color = GRADE_COLORS[o.grade];
              return (
                <Link className="ios-row" to={`/subject/${subject.code}`} key={subject.id}>
                  <div className="ios-body">
                    <div className="t">{subject.name}</div>
                    <div className="s">
                      {o.hasAnyMarks
                        ? `internal ${Math.round(o.internalObtained)}/${Math.round(o.internalMax)} · on track for ${Math.round(o.predictedTotal)}/100`
                        : "no marks entered yet"}
                    </div>
                  </div>
                  <div className="ios-trail">
                    {o.hasAnyMarks ? (
                      <span
                        className="ios-grade"
                        style={{ color, background: `${color}22` }}
                      >
                        {o.grade}
                      </span>
                    ) : (
                      <span className="ios-val">—</span>
                    )}
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
