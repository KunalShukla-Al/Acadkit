import { isNonGraded } from "@acadkit/core/grades";
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ClipboardPaste, Pencil, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Dot } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { SubjectSheet } from "@/components/sheets/subject-sheet";
import { PortalPasteSheet } from "@/components/sheets/portal-paste-sheet";
import { CopyAllMarks } from "@/components/settings/copy-all-marks";
import { DataCard } from "@/components/settings/data-card";
import { IphoneCard } from "@/components/settings/iphone-card";
import { usePush } from "@/hooks/usePush";
import { useSession } from "@/hooks/useSession";
import { useResetOn } from "@/hooks/useResetOn";
import { usePendingAutoMarks } from "@/hooks/useAutoMark";
import { useToday } from "@/hooks/useToday";
import {
  useAttendance,
  useAutoMark,
  useClearAutoMarks,
  usePortalSnapshots,
  useSettings,
  useSubjects,
  useUpdateSettings,
  useUpdateSubject,
} from "@/hooks/useData";
import { updateSettings as apiUpdateSettings } from "@/api/settings";
import { signOut } from "@/lib/auth";
import { describePending } from "@/lib/autoMark";
import { COMMIT, notesFor, VERSION } from "@/lib/release";
import { formatSize } from "@/lib/studyFiles";
import { syncHealth } from "@/lib/syncHealth";
import { parseTomorrow, savedTomorrow, TOMORROW_EVENT, tomorrowLine } from "@/lib/tomorrow";
import type { ThemeName } from "@/lib/themes";
import { cn, haptic } from "@/lib/utils";
import { semesterWindow } from "@acadkit/core/calendar";
import { relativeDay } from "@acadkit/core/dates";
import { useAppStore, type ColorMode } from "@/store/app";
import type { Subject } from "@acadkit/core/types";

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="px-1 text-xs font-bold uppercase tracking-widest text-muted">{children}</h2>;
}

/** A section's settings, one row each, in one card. */
function Group({ children }: { children: ReactNode }) {
  return <section className="card divide-y overflow-hidden p-0">{children}</section>;
}

/** One setting: its name (and a short hint where the choice isn't obvious), and its control on the right. */
function Row({ label, hint, children }: { label: string; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** A short text or number field with Save beside it once it changes. */
function SaveField({
  label,
  hint,
  value,
  onChange,
  dirty,
  onSave,
  ...input
}: {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  dirty: boolean;
  onSave: () => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <Row label={label} hint={hint}>
      <Input
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && dirty && onSave()}
        className="h-10 w-28 text-right"
        {...input}
      />
      {dirty && (
        <Button size="sm" onClick={onSave}>
          Save
        </Button>
      )}
    </Row>
  );
}

function NameRow() {
  const pin = useAppStore((s) => s.pin)!;
  const localName = useAppStore((s) => s.name);
  const setName = useAppStore((s) => s.setName);
  const { data: settings } = useSettings();
  const stored = settings?.name ?? localName;
  const [input, setInput] = useState(stored);

  // Adopt the cloud name once it loads, unless the user already typed.
  useResetOn(settings?.name || null, (name) => {
    if (input === "") setInput(name);
  });

  function save() {
    const name = input.trim();
    setName(name);
    // Best-effort cloud copy so the name follows the account.
    void apiUpdateSettings(pin, { name }).catch(() => {});
    toast.success(name ? "Name saved" : "Name cleared");
  }

  return (
    <SaveField
      label="Name"
      hint="On the marks card you share"
      value={input}
      onChange={setInput}
      dirty={input.trim() !== (stored ?? "")}
      onSave={save}
      placeholder="Your name"
      maxLength={30}
      className="h-10 w-36"
    />
  );
}

function SignedInRow() {
  const { session } = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <Row label="Signed in" hint={session?.user?.email ?? "—"}>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          // The session, this device's reminders and the local cache go; the data stays on the account.
          await signOut();
          setBusy(false);
        }}
      >
        Sign out
      </Button>
    </Row>
  );
}

function PortalGroup() {
  const qc = useQueryClient();
  const { data: snapshots } = usePortalSnapshots();
  const [busy, setBusy] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const health = syncHealth(snapshots ?? []);

  async function refresh() {
    setBusy(true);
    try {
      // refetchQueries, not invalidateQueries: invalidate returns at once, before anything arrives.
      await Promise.race([
        qc.refetchQueries({ type: "active" }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10_000)),
      ]);
      toast.success("Up to date");
    } catch {
      toast.error("Couldn't reach the server", { description: "You're seeing the last data this device stored." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Group>
      <Row
        label="Portal data"
        hint={
          health.state === "never" ? (
            "Not synced yet"
          ) : (
            <span className={cn(health.state === "stale" && "font-semibold text-warn-deep")}>Synced {relativeDay(health.asOf!)}</span>
          )
        }
      >
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          aria-label="Refresh from the server"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink"
        >
          <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
        </button>
      </Row>
      <button type="button" onClick={() => setPasteOpen(true)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-2/50">
        <ClipboardPaste className="h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 text-sm font-bold">Paste a portal page</span>
        <span className="text-xs text-muted">attendance, marks, timetable</span>
      </button>
      <div>
        <button
          type="button"
          onClick={() => setHowOpen((v) => !v)}
          aria-expanded={howOpen}
          className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-2/50"
        >
          <span className="min-w-0 flex-1 text-sm font-bold">Copy every subject's marks at once</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", howOpen && "rotate-180")} />
        </button>
        {howOpen && (
          <div className="px-5 pb-4">
            <CopyAllMarks />
          </div>
        )}
      </div>
      <PortalPasteSheet open={pasteOpen} onClose={() => setPasteOpen(false)} />
    </Group>
  );
}

function TargetSgpaRow() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const stored = settings?.target_sgpa ?? 8.5;
  const [value, setValue] = useState(String(stored));
  useResetOn(String(stored), () => setValue(String(stored)));

  const parsed = Number(value);
  // Below 5 is an F average, above 10 is off the scale: neither is a goal.
  const invalid = !value || Number.isNaN(parsed) || parsed < 5 || parsed > 10;

  function save() {
    if (invalid) {
      toast.error("Pick a target between 5.0 and 10.0");
      return;
    }
    updateSettings.mutate({ target_sgpa: parsed });
    toast.success(`Aiming at ${parsed.toFixed(1)} SGPA`);
  }

  return (
    <SaveField
      label="Target SGPA"
      value={value}
      onChange={setValue}
      dirty={!invalid && parsed !== stored}
      onSave={save}
      type="number"
      inputMode="decimal"
      step="0.1"
      min="5"
      max="10"
    />
  );
}

function EndSemRow() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const stored = settings?.assumed_external_pct ?? null;
  const shown = stored === null ? "" : String(stored);
  const [value, setValue] = useState(shown);
  useResetOn(shown, () => setValue(shown));

  const blank = value.trim() === "";
  const parsed = Number(value);
  const invalid = !blank && (Number.isNaN(parsed) || parsed < 0 || parsed > 100);

  function save() {
    const next = blank ? null : parsed;
    updateSettings.mutate({ assumed_external_pct: next });
    toast.success(next === null ? "End-sem back in the spread" : `Assuming ${next}% in the end-sem`);
  }

  return (
    <SaveField
      label="Expected end-sem score (%)"
      hint="Targets solve the internals against it; blank spreads them"
      value={value}
      onChange={setValue}
      dirty={!invalid && (blank ? stored !== null : parsed !== stored)}
      onSave={save}
      type="number"
      inputMode="numeric"
      min={0}
      max={100}
      placeholder="—"
    />
  );
}

function SemesterDatesRow() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  // The two fields, not the settings object: React Query hands back a new object on every refetch.
  const semStart = settings?.sem_start ?? null;
  const semEnd = settings?.sem_end ?? null;
  const defaults = useMemo(() => semesterWindow({ sem_start: semStart, sem_end: semEnd }), [semStart, semEnd]);
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  useResetOn(`${defaults.start} ${defaults.end}`, () => {
    setStart(defaults.start);
    setEnd(defaults.end);
  });

  const dirty = start !== defaults.start || end !== defaults.end;
  const invalid = !start || !end || start >= end;

  function save() {
    if (invalid) {
      toast.error("Start date must be before the end date");
      return;
    }
    updateSettings.mutate({ sem_start: start, sem_end: end });
    toast.success("Semester dates updated - day orders recalculated everywhere");
  }

  return (
    <div className="space-y-3 px-5 py-3.5">
      <p className="text-sm font-bold">Semester</p>
      {/* iOS won't shrink a native date field below its own width, so two across overflow on a phone. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Classes start">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-10" />
        </Field>
        <Field label="Semester ends">
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-10" />
        </Field>
      </div>
      {dirty && (
        <Button onClick={save} disabled={invalid} size="sm" className="w-full">
          Save semester dates
        </Button>
      )}
    </div>
  );
}

function MedicalLeaveRow() {
  const { data: subjects } = useSubjects();
  const update = useUpdateSubject();
  const list = subjects ?? [];
  const on = list.length > 0 && list.every((s) => s.medical_leave);
  const some = list.filter((s) => s.medical_leave);

  function set(next: boolean) {
    for (const s of list) if (!!s.medical_leave !== next) update.mutate({ id: s.id, patch: { medical_leave: next } });
    toast.success(next ? "Medical leave on - every subject's bar is now 65%" : "Medical leave off - back to 75%");
  }

  return (
    <Row
      label="Medical leave"
      hint={
        !on && some.length > 0 ? (
          <span className="font-semibold text-warn-deep">On for {some.map((s) => s.short_name?.trim() || s.name).join(", ")} only</span>
        ) : (
          "The bar drops from 75% to 65%"
        )
      }
    >
      <Switch checked={on} onChange={set} label="Medical leave granted for this semester" />
    </Row>
  );
}

function AssumePresentRow() {
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const pending = usePendingAutoMarks();
  const autoMark = useAutoMark();
  const clearAuto = useClearAutoMarks();
  const { data: attendance } = useAttendance();
  const on = settings?.auto_mark_present === true;
  const autoCount = (attendance ?? []).filter((a) => a.auto_marked).length;

  return (
    <div>
      <Row label="Assume present" hint="Unmarked past classes count as attended">
        <Switch checked={on} onChange={(next) => update.mutate({ auto_mark_present: next })} label="Assume present for unmarked past classes" />
      </Row>
      {(pending.length > 0 || autoCount > 0) && (
        <div className="-mt-1.5 flex flex-wrap items-center gap-2 px-5 pb-3.5">
          <span className="min-w-0 flex-1 text-xs text-muted">{describePending(pending)}</span>
          {pending.length > 0 && (
            <Button variant="secondary" size="sm" disabled={autoMark.isPending} onClick={() => autoMark.mutate(pending)}>
              {autoMark.isPending ? "Marking…" : "Catch up now"}
            </Button>
          )}
          {autoCount > 0 && (
            <Button variant="ghost" size="sm" disabled={clearAuto.isPending} onClick={() => clearAuto.mutate()}>
              Undo {autoCount} auto-marked
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function SubjectsCard() {
  const { data: subjects } = useSubjects();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);

  return (
    <section className="card p-0">
      <Row
        label="Subjects"
        hint={`${(subjects ?? []).length} subjects · ${(subjects ?? []).reduce((s, x) => s + x.credits, 0)} credits`}
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setEditing(null);
            setSheetOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Add
        </Button>
      </Row>
      <div className="space-y-0.5 px-2 pb-2">
        {(subjects ?? []).map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setEditing(s);
              setSheetOpen(true);
            }}
            className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2/70"
          >
            <Dot color={s.color_hex} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.name}</span>
            <span className="text-xs font-medium text-muted">
              {s.credits === 0 ? "audit" : isNonGraded(s.code) ? `${s.credits} cr · non-graded` : `${s.credits} cr`}
            </span>
            <Pencil className="h-3.5 w-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ))}
      </div>
      <SubjectSheet open={sheetOpen} onClose={() => setSheetOpen(false)} subject={editing} />
    </section>
  );
}

function LookGroup() {
  const themeName = useAppStore((s) => s.themeName);
  const setThemeName = useAppStore((s) => s.setThemeName);
  const themeMode = useAppStore((s) => s.themeMode);
  const setThemeMode = useAppStore((s) => s.setThemeMode);
  return (
    <Group>
      <Row label="Theme" hint={themeName === "oled" ? "True black, no colour" : "Lime, loud, oversized"}>
        <Segmented<ThemeName>
          layoutId="theme-name"
          options={[
            { value: "brutalist", label: "Brutalist" },
            { value: "oled", label: "OLED" },
          ]}
          value={themeName}
          onChange={setThemeName}
          className="w-48"
        />
      </Row>
      <div className="px-5 py-3.5">
        <Segmented<ColorMode>
          layoutId="theme-mode"
          options={[
            { value: "light", label: "Light" },
            { value: "system", label: "System" },
            { value: "dark", label: "Dark" },
          ]}
          value={themeMode}
          onChange={setThemeMode}
        />
      </div>
    </Group>
  );
}

function RemindersRow() {
  const { supported, subscribed, busy, permission, enable, disable } = usePush();
  const hint = !supported
    ? "On an iPhone, add AcadKit to the Home Screen first"
    : permission === "denied"
      ? "Blocked in the browser's settings for this site"
      : "Classes, deadlines and low attendance";
  return (
    <Row label="Reminders" hint={<span className={cn(permission === "denied" && "font-semibold text-bad-deep")}>{hint}</span>}>
      {supported && permission !== "denied" && (
        <Switch checked={subscribed} onChange={() => (busy ? undefined : subscribed ? disable() : enable())} label="Reminders" tone="accent" />
      )}
    </Row>
  );
}

function onTomorrow(onChange: () => void) {
  window.addEventListener(TOMORROW_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(TOMORROW_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Tomorrow offline (src/lib/tomorrow.ts), and what its last run kept: "Tomorrow's files are on this device · 4 files, 18 MB". */
function TomorrowRow() {
  const on = useAppStore((s) => s.tomorrowOffline);
  const setOn = useAppStore((s) => s.setTomorrowOffline);
  const { today } = useToday();
  const state = parseTomorrow(useSyncExternalStore(onTomorrow, savedTomorrow));
  const kept = on && state ? tomorrowLine(state, today.date) : null;
  return (
    <Row
      label="Tomorrow offline"
      hint={kept && state ? `${kept} · ${state.ready} file${state.ready === 1 ? "" : "s"}, ${formatSize(state.bytes)}` : "The next day's files, each evening, up to 80 MB"}
    >
      <Switch checked={on} onChange={setOn} label="Tomorrow offline" tone="accent" />
    </Row>
  );
}

/** A section that starts folded away. */
function CollapsibleSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          haptic();
          setOpen((o) => !o);
        }}
        className="flex w-full items-center justify-between px-1 py-1 text-left"
      >
        <span className="text-xs font-bold uppercase tracking-widest text-muted">{title}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            // Children have shadows and rings that would be clipped mid-animation; overflow only hides while moving.
            className="space-y-3 overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Settings, opened from the ball: one short row per setting, grouped. */
export default function Settings() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="px-1 text-2xl font-extrabold tracking-tight lg:text-3xl">Settings</h1>

      <div className="space-y-3">
        <SectionTitle>Account</SectionTitle>
        <Group>
          <NameRow />
          <SignedInRow />
        </Group>
      </div>

      <div className="space-y-3">
        <SectionTitle>Portal</SectionTitle>
        <PortalGroup />
      </div>

      <div className="space-y-3">
        <SectionTitle>Academics</SectionTitle>
        <Group>
          <TargetSgpaRow />
          <EndSemRow />
          <SemesterDatesRow />
          <MedicalLeaveRow />
          <AssumePresentRow />
        </Group>
        <SubjectsCard />
      </div>

      <div className="space-y-3">
        <SectionTitle>Look</SectionTitle>
        <LookGroup />
      </div>

      <div className="space-y-3">
        <SectionTitle>Phone and Mac</SectionTitle>
        <Group>
          <RemindersRow />
          <TomorrowRow />
        </Group>
        <IphoneCard />
      </div>

      <CollapsibleSection title="Data">
        <DataCard />
      </CollapsibleSection>

      {/* The build, for bug reports: the same tag every crash report carries. */}
      <p className="pb-4 pt-2 text-center text-xs text-muted tabular">
        AcadKit {VERSION}
        {COMMIT && ` · ${COMMIT}`}
        {" · "}
        <a href={notesFor(VERSION)} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
          What's new
        </a>
      </p>
    </div>
  );
}
