import { useState } from "react";
import { BookOpen, Clock, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
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
function ThemeTokens({ name, theme }: { name: string; theme: { $about?: string; light: Record<string, string>; dark: Record<string, string> } }) {
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
          <Empty title="No tests this week" detail="Tests and deadlines you add show here." action={<Button variant="secondary" size="sm">Add one</Button>} />
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

      <Section title="Tokens">
        {Object.entries(tokens.themes).map(([name, theme]) => (
          <ThemeTokens key={name} name={name} theme={theme} />
        ))}
      </Section>
    </main>
  );
}
