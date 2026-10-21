import { useState } from "react";
import { BookOpen, Clock, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { attendanceWorking, oddsWorking, planWorking, sgpaWorking, skipsWorking } from "@acadkit/core/explain";
import { gradeOdds } from "@acadkit/core/odds";
import { computeSgpa, solveSubjectPlan } from "@acadkit/core/plan";
import { buildProjection } from "@acadkit/core/projections";
import type { AttendanceRecord, Subject } from "@acadkit/core/types";
import { ExplainerPlayer } from "@/components/explainer/player";
import { AttendanceScene } from "@/components/explainer/scenes/attendance";
import { DayScene } from "@/components/explainer/scenes/day";
import { MarksScene } from "@/components/explainer/scenes/marks";
import { OddsScene } from "@/components/explainer/scenes/odds";
import { SgpaScene } from "@/components/explainer/scenes/sgpa";
import { SkipsScene } from "@/components/explainer/scenes/skips";
import { dayWorking } from "@/lib/dayWorking";
import { buildSurvivalPlan } from "@/lib/survival";
import { Empty } from "@/components/primitives/empty";
import { Figure } from "@/components/primitives/figure";
import { Line } from "@/components/primitives/line";
import { Row, Rows } from "@/components/primitives/row";
import { Sheet } from "@/components/primitives/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { contrast } from "@/design/color";
import { resolve } from "@/design/css";
import tokens from "@/design/tokens.json";

const TEXT = new Set(["ink", "muted", "accent-deep", "good-deep", "warn-deep", "bad-deep"]);
const isColour = (v: string) => /^[\d.]+ [\d.]+% [\d.]+%$/.test(v);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">{title}</h2>
      {children}
    </section>
  );
}

/** One theme's tokens, light beside dark, each text colour with its contrast on the background. */
function ThemeTokens({ name, theme }: { name: string; theme: (typeof tokens.themes)[keyof typeof tokens.themes] }) {
  const keys = Object.keys(theme.light);
  return (
    <div className="card overflow-x-auto p-4">
      <p className="text-sm font-semibold">{name}</p>
      {"$about" in theme && <p className="mt-0.5 text-xs text-muted">{theme.$about}</p>}
      <table className="mt-3 w-full text-left text-xs">
        <thead className="text-muted">
          <tr>
            <th className="py-1 font-medium">Token</th>
            <th className="py-1 font-medium">Light</th>
            <th className="py-1 font-medium">Dark</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k} className="border-t">
              <td className="whitespace-nowrap py-1.5 pr-4 font-mono">{k}</td>
              {(["light", "dark"] as const).map((mode) => {
                const t: Record<string, string> = theme[mode];
                const v = resolve(t, k);
                const ratio = TEXT.has(k) && isColour(v) ? contrast(v, resolve(t, "bg")) : null;
                return (
                  <td key={mode} className="whitespace-nowrap py-1.5 pr-4">
                    <span className="flex items-center gap-2">
                      {isColour(v) && <span aria-hidden className="h-4 w-4 shrink-0 rounded border" style={{ backgroundColor: `hsl(${v})` }} />}
                      <span className="max-w-48 truncate font-mono text-muted" title={t[k]}>
                        {t[k]}
                      </span>
                      {ratio !== null && <span className="tabular">{ratio.toFixed(1)}:1</span>}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Every design token and every primitive on one page (/design), in
 * the theme the app is in: what the screens are built from, and what the
 * screenshot tests photograph.
 */
/** A sample subject for the explainers: OS, 42 of 50 classes attended. */
const OS: Subject = { id: "os", device_id: "", code: "21CSC202J", name: "Operating Systems", short_name: "OS", credits: 4, type: "theory", faculty: null, color_hex: "#000" };
const OS_CLASSES: AttendanceRecord[] = Array.from({ length: 50 }, (_, i) => ({
  id: `os-${i}`,
  device_id: "",
  subject_id: "os",
  date: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`,
  start_time: "08:00",
  end_time: "08:50",
  status: i < 42 ? "present" : "absent",
}));

/** A day for the days-off explainer: DSA at 9 with classes to spare, OS at 11 with none. */
const DSA: Subject = { ...OS, id: "dsa", code: "21CSC201J", name: "Data Structures and Algorithms", short_name: "DSA" };
const slot = (subject_id: string, start_time: string) => ({ id: subject_id, device_id: "", subject_id, day_order: 1, start_time, end_time: start_time, room: null });
const DAY_PLAN = buildSurvivalPlan(
  [
    { subject: DSA, attended: 9, held: 10 },
    { subject: OS, attended: 6, held: 8 },
  ],
  [slot("dsa", "09:00:00"), slot("os", "11:00:00")],
  { "2026-11-09": 1, "2026-11-16": 1 },
  "2026-11-09"
);

/** A plan for the marks explainer: DSA, 60/40, 7 banked after a 2 of 15 in CT-1, aiming for an A. */
const DSA_PLAN = solveSubjectPlan(
  {
    ...DSA,
    assessment: {
      internal: 60,
      complete: false,
      components: [
        { key: "Assignment", label: "Assignment", type: "Assignment", max: 5 },
        { key: "CT-1", label: "CT-1", type: "CT", max: 15 },
        { key: "CT-2", label: "CT-2", type: "CT", max: 15 },
        { key: "Lab", label: "Lab", type: "Lab", max: 10 },
        { key: "Model", label: "Model", type: "CT", max: 15 },
      ],
    },
  },
  [
    { id: "m1", device_id: "", subject_id: "dsa", component_type: "Assignment", label: "Assignment", marks_obtained: 5, max_marks: 5, is_external: false },
    { id: "m2", device_id: "", subject_id: "dsa", component_type: "CT", label: "CT-1", marks_obtained: 2, max_marks: 15, is_external: false },
  ],
  "A"
);

/** The SGPA and odds explainers' semester: DSA at 5 of 5 and 12 of 15, OS at 12 and 9 of 15 in two FTs. */
const SEM_SUBJECTS: Subject[] = [
  DSA_PLAN.subject,
  { ...OS, assessment: { internal: 60, complete: false, components: ["FT-1", "FT-2", "FT-3", "FT-4"].map((l) => ({ key: l, label: l, type: "CT" as const, max: 15 })) } },
];
const SEM_MARKS = [
  { id: "m1", device_id: "", subject_id: "dsa", component_type: "Assignment" as const, label: "Assignment", marks_obtained: 5, max_marks: 5, is_external: false },
  { id: "m2", device_id: "", subject_id: "dsa", component_type: "CT" as const, label: "CT-1", marks_obtained: 12, max_marks: 15, is_external: false },
  { id: "m3", device_id: "", subject_id: "os", component_type: "CT" as const, label: "FT-1", marks_obtained: 12, max_marks: 15, is_external: false },
  { id: "m4", device_id: "", subject_id: "os", component_type: "CT" as const, label: "FT-2", marks_obtained: 9, max_marks: 15, is_external: false },
];
const SEM_SGPA = computeSgpa(
  SEM_SUBJECTS,
  new Map(SEM_SUBJECTS.map((s) => [s.id, SEM_MARKS.filter((m) => m.subject_id === s.id)]))
);
const OS_PROJECTION = buildProjection(SEM_SUBJECTS, [], [], SEM_MARKS, [], "2026-09-26", { start: "2026-07-21", end: "2026-11-18" }, 8.5).gradeProjections.find((p) => p.subject.id === "os")!;
const OS_ODDS = gradeOdds([OS_PROJECTION], 8.5).subjects[0];

export default function Design() {
  const [sheet, setSheet] = useState(false);
  const [on, setOn] = useState(true);
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-5 pb-16 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Design</h1>
          <p className="text-sm text-muted">The tokens, and the primitives, in the current theme.</p>
        </div>
        <Link to="/settings" className="text-sm text-accent-deep">
          Settings
        </Link>
      </header>

      <Section title="Figure">
        <div className="card flex flex-wrap items-end gap-8 p-5">
          <Figure value={82} unit="%" label="attendance" size="lg" />
          <Figure value="8.65" label="predicted SGPA" tone="accent" />
          <Figure value={3} label="classes to spare" tone="good" size="sm" />
          <Figure value={2} label="to get back" tone="warn" size="sm" />
          <Figure value={61} unit="%" label="under the bar" tone="bad" size="sm" />
        </div>
      </Section>

      <Section title="Line">
        <div className="card p-5">
          <Line dot="#f97316" value="10:00">
            <b className="font-semibold">Operating Systems</b> in TP304
          </Line>
          <Line icon={Clock} value="in 2 days" tone="warn">
            OS FT-II
          </Line>
          <Line icon={Sparkles} value="Undo" tone="accent">
            Added OS FT-II from notice.jpg
          </Line>
        </div>
      </Section>

      <Section title="Row">
        <div className="card px-5">
          <Rows>
            <Row title="Operating Systems" detail="2 classes to spare" value="82%" to="/attendance" />
            <Row title="Data Structures and Algorithms" detail="Lab on Day Order 3" value="76%" onClick={() => setSheet(true)} />
            <Row title="Professional Ethics" detail="No end-sem" value="91%" />
          </Rows>
        </div>
      </Section>

      <Section title="Empty">
        <div className="card">
          <Empty title="No tests this week" detail="Tests and deadlines you add, or Autopilot reads from a notice, show here." action={<Button variant="secondary" size="sm">Add one</Button>} />
        </div>
      </Section>

      <Section title="Sheet and switch">
        <div className="card flex items-center justify-between gap-4 p-5">
          <Button onClick={() => setSheet(true)}>
            <BookOpen className="h-4 w-4" /> Open a sheet
          </Button>
          <Switch checked={on} onChange={setOn} label="A switch" tone="accent" />
        </div>
        <Sheet
          open={sheet}
          onOpenChange={setSheet}
          title="Delete this deadline?"
          description="OS FT-II on Thu, 29 Oct"
          primary={{ label: "Delete", onClick: () => setSheet(false), danger: true }}
          secondary={{ label: "Keep", onClick: () => setSheet(false) }}
        >
          <p className="text-sm text-muted">A sheet holds one decision, with its actions at the foot.</p>
        </Sheet>
      </Section>

      <Section title="Explainers">
        <div className="card p-5">
          {/* At rest on its last step, so the catalog's pictures don't catch it moving. */}
          <ExplainerPlayer title="Attendance in OS" working={attendanceWorking(OS, OS_CLASSES)} scene={AttendanceScene} autoPlay={false} initialStep={2} />
        </div>
        <div className="card p-5">
          <ExplainerPlayer title="Classes you can skip in OS" working={skipsWorking(42, 50, 75)} scene={SkipsScene} autoPlay={false} initialStep={2} />
        </div>
        <div className="card p-5">
          <ExplainerPlayer title="Monday 9 November" working={dayWorking(DAY_PLAN, "2026-11-09")!} scene={DayScene} autoPlay={false} initialStep={2} />
        </div>
        <div className="card p-5">
          <ExplainerPlayer title="Marks needed for an A in DSA" working={planWorking(DSA_PLAN)} scene={MarksScene} autoPlay={false} initialStep={3} />
        </div>
        <div className="card p-5">
          <ExplainerPlayer title="Predicted SGPA" working={sgpaWorking(SEM_SGPA)} scene={SgpaScene} autoPlay={false} initialStep={2} />
        </div>
        <div className="card p-5">
          <ExplainerPlayer
            title="The odds in OS"
            working={oddsWorking(OS_ODDS, { name: "OS", banked: OS_PROJECTION.plan.banked })}
            scene={OddsScene}
            autoPlay={false}
            initialStep={3}
          />
        </div>
      </Section>

      <Section title="Tokens">
        {Object.entries(tokens.themes).map(([name, theme]) => (
          <ThemeTokens key={name} name={name} theme={theme} />
        ))}
      </Section>
    </main>
  );
}
