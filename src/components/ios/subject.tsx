import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { warmViewer } from "@/components/viewer/loaders";
import { FileRow } from "@/components/study/file-row";
import {
  useAttendance,
  useListedDeadlines,
  useMarks,
  usePin,
  usePortalSnapshots,
  useSubjects,
} from "@/hooks/useData";
import { fetchStudyManifest } from "@/api/studyFiles";
import { computeSubjectAttendance, snapshotsByCode } from "@acadkit/core/attendance";
import { formatDate } from "@acadkit/core/dates";
import type { FileKind, StudyFile } from "@/lib/studyFiles";
import { Chevron } from "./bits";
import { attnTone } from "./util";
import "./ios.css";

const norm = (code: string) => code.replace(/\s/g, "").toUpperCase();

const KIND_ORDER: { kind: FileKind; label: string }[] = [
  { kind: "notes", label: "Notes" },
  { kind: "guide", label: "Guides & prep" },
  { kind: "lab", label: "Lab" },
  { kind: "assignment", label: "Assignments" },
  { kind: "pyq", label: "Past papers" },
  { kind: "syllabus", label: "Syllabus & plan" },
  { kind: "whatsapp", label: "From WhatsApp" },
  { kind: "other", label: "Other" },
];

/** One subject in iOS idiom: a standing summary over its files, grouped by kind. */
export function SubjectApple() {
  useEffect(() => warmViewer(), []);
  const { code: raw = "" } = useParams();
  const code = norm(raw);
  const pin = usePin();

  const { data: subjects } = useSubjects();
  const { data: attendance } = useAttendance();
  const { data: snapshots } = usePortalSnapshots();
  const { data: marks } = useMarks();
  const { data: deadlines } = useListedDeadlines();
  const manifest = useQuery({
    queryKey: ["study-files", pin],
    queryFn: () => fetchStudyManifest(pin),
    staleTime: 5 * 60_000,
  });

  const subject = subjects?.find((s) => norm(s.code) === code);

  const files = useMemo(
    () => (manifest.data?.files ?? []).filter((f) => f.subject_code && norm(f.subject_code) === code),
    [manifest.data, code]
  );
  const groups = useMemo(() => {
    return KIND_ORDER.map((k) => ({
      ...k,
      files: files.filter((f) => (f.kind ?? "other") === k.kind),
    })).filter((g) => g.files.length > 0);
  }, [files]);

  const att = useMemo(() => {
    if (!subject) return null;
    return computeSubjectAttendance(subject, attendance ?? [], snapshotsByCode(snapshots ?? []).get(code));
  }, [subject, attendance, snapshots, code]);

  const subjectMarks = useMemo(
    () => (subject ? (marks ?? []).filter((m) => m.subject_id === subject.id) : []),
    [marks, subject]
  );
  const got = subjectMarks.reduce((n, m) => n + m.marks_obtained, 0);
  const outOf = subjectMarks.reduce((n, m) => n + m.max_marks, 0);

  const [now] = useState(() => Date.now());
  const next = useMemo(() => {
    if (!subject) return null;
    return (
      (deadlines ?? [])
        .filter((d) => d.subject_id === subject.id && d.status === "pending" && new Date(d.due_date).getTime() >= now)
        .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null
    );
  }, [deadlines, subject, now]);

  const hasSummary = att !== null || outOf > 0 || next !== null;

  return (
    <div className="ios-screen">
      <header className="ios-large">
        <div className="date">{subject?.code ?? code}</div>
        <h1>{subject?.name ?? code}</h1>
      </header>

      {hasSummary && (
        <section className="ios-sec" aria-labelledby="ios-subj-summary">
          <div className="hd" id="ios-subj-summary"><span>This semester</span></div>
          <div className="ios-group">
            {att && att.percentage !== null && (
              <Link className="ios-row" to="/skips">
                <div className="ios-body">
                  <div className="t">Attendance</div>
                  <div className="s">
                    {att.canBunk > 0
                      ? `can skip ${att.canBunk} more · ${att.attended}/${att.total}`
                      : att.needToAttend > 0
                        ? `attend ${att.needToAttend} to reach ${att.min}%`
                        : `at the ${att.min}% line · ${att.attended}/${att.total}`}
                  </div>
                </div>
                <div className="ios-trail">
                  <span className="ios-badge" style={{ color: `hsl(var(--${attnTone(att.percentage, att.min)}))` }}>
                    {Math.round(att.percentage)}%
                  </span>
                  <Chevron />
                </div>
              </Link>
            )}
            {outOf > 0 && (
              <Link className="ios-row" to="/marks">
                <div className="ios-body">
                  <div className="t">Marks</div>
                  <div className="s">internal recorded so far</div>
                </div>
                <div className="ios-trail">
                  <span className="ios-val">{got}/{outOf}</span>
                  <Chevron />
                </div>
              </Link>
            )}
            {next && (
              <Link className="ios-row" to="/deadlines">
                <div className="ios-body">
                  <div className="t">{next.title}</div>
                  <div className="s">next due</div>
                </div>
                <div className="ios-trail">
                  <span className="ios-val">{formatDate(next.due_date)}</span>
                  <Chevron />
                </div>
              </Link>
            )}
          </div>
        </section>
      )}

      {groups.length === 0 ? (
        <section className="ios-sec">
          <div className="ios-empty">Nothing in your study folder has this course code yet.</div>
        </section>
      ) : (
        groups.map((g) => (
          <section className="ios-sec" key={g.kind} aria-label={g.label}>
            <div className="hd"><span>{g.label}</span><span className="ios-val">{g.files.length}</span></div>
            <div className="ios-group ios-files">
              {g.files.map((f: StudyFile) => (
                <FileRow key={f.path} file={f} showFolder={false} />
              ))}
            </div>
          </section>
        ))
      )}

      <div className="ios-foot">AcadKit · Apple theme</div>
    </div>
  );
}
