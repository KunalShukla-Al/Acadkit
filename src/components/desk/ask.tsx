import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Send, Sparkles } from "lucide-react";
import { fetchAskAnswer, fetchAskHeartbeat, sendAsk } from "@/api/desk";
import { Button } from "@/components/ui/button";
import { usePin } from "@/hooks/useData";
import { askPrompt, claudeUrl, type DeskCourse, type DeskItem } from "@/lib/desk";
import { cn } from "@/lib/utils";

/** The Mac counts as away when its listener hasn't looked at the inbox for this long. */
const AWAY_MS = 3 * 60_000;
/** How long to wait for the Mac to start before offering Claude on the web. */
const WAIT_MS = 15_000;

type Turn = { role: "user" | "assistant"; text: string };

const threads = new Map<string, Turn[]>();

/**
 * Ask Claude about one question. The Mac answers it (scripts/desk-ask.mjs)
 * with the study folder to read; the answer shows as it's written. When the
 * Mac is away or slow to start, the same question opens in Claude.
 */
export function AskClaude({ course, item }: { course: DeskCourse; item: DeskItem }) {
  const pin = usePin();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [thread, setThread] = useState<Turn[]>(() => threads.get(item.key) ?? []);
  const [pending, setPending] = useState<{ id: string; at: number; prompt: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const beat = useQuery({ queryKey: ["ask-heartbeat", pin], queryFn: () => fetchAskHeartbeat(pin), enabled: open, staleTime: 30_000 });
  const answer = useQuery({
    queryKey: ["ask", pin, pending?.id ?? null],
    queryFn: () => fetchAskAnswer(pin, pending!.id),
    enabled: !!pending,
    refetchInterval: (q) => (q.state.data?.done ? false : 1500),
    gcTime: 0,
  });

  const finished = pending && answer.data?.done ? answer.data : null;
  const busy = !!pending && !finished;

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [busy]);

  const away = beat.data != null ? now - beat.data > AWAY_MS : beat.isFetched;
  const slow = busy && !answer.data && now - pending!.at > WAIT_MS;

  async function ask() {
    const text = draft.trim();
    const prompt = askPrompt(course, item, text);
    const id = `${item.key.replace(/[^A-Za-z0-9_-]/g, "_")}-${Date.now().toString(36)}`;
    // The last answer joins the thread, so a follow-up carries it.
    const before: Turn[] = finished
      ? [...thread, { role: "assistant", text: finished.error ? `The Mac couldn't answer: ${finished.error}` : finished.text }]
      : thread;
    const next: Turn[] = [...before, { role: "user", text: text || "Write an exam-ready answer." }];
    threads.set(item.key, next);
    setThread(next);
    setDraft("");
    setPending({ id, at: Date.now(), prompt });
    setNow(Date.now());
    try {
      await sendAsk(pin, { id, item: item.key, prompt, thread: before, at: Date.now() });
    } catch {
      setPending((p) => (p ? { ...p, at: 0 } : p));
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-2 text-xs font-bold hover:bg-surface-2/70">
        <Sparkles className="h-3.5 w-3.5 text-accent" /> Ask Claude
      </button>
    );
  }

  const live = pending ? answer.data : null;
  return (
    <section className="w-full space-y-3 rounded-2xl border p-3" aria-label="Ask Claude">
      {thread.map((t, i) => (
        <div key={i} className={cn("text-sm leading-relaxed", t.role === "user" ? "font-semibold" : "")}>
          {t.role === "user" ? <p className="whitespace-pre-wrap">{t.text}</p> : <AnswerText text={t.text} />}
        </div>
      ))}
      {pending && (
        <div className="space-y-1 text-sm leading-relaxed">
          {live?.text ? <AnswerText text={live.error ? `The Mac couldn't answer: ${live.error}` : live.text} /> : null}
          {busy && (
            <p className="text-xs font-semibold text-muted">
              {live?.status ?? (live ? "Writing…" : away ? "The Mac looks away." : "Sent to your Mac…")}
            </p>
          )}
        </div>
      )}
      {(away || slow) && !finished && (
        <a href={claudeUrl(pending?.prompt ?? askPrompt(course, item, draft))} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs font-bold text-accent">
          <ExternalLink className="h-3.5 w-3.5" /> Open in Claude instead
        </a>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder={thread.length ? "Ask a follow-up" : "Ask about this question, or leave empty for an exam-ready answer"}
          className="min-h-10 flex-1 resize-y rounded-xl border bg-surface px-3 py-2 text-sm"
        />
        <Button onClick={() => void ask()} disabled={busy} aria-label="Ask">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}

/**
 * An answer as text: code fences as code blocks, everything else as
 * paragraphs. Never HTML, so nothing in an answer can run.
 */
export function AnswerText({ text }: { text: string }) {
  const parts = text.split(/^```[^\n]*\n?/m);
  return (
    <div className="space-y-2">
      {parts.map((p, i) =>
        i % 2 ? (
          <pre key={i} className="overflow-x-auto rounded-xl bg-surface-2 p-3 text-xs leading-relaxed">
            <code>{p.replace(/\n$/, "")}</code>
          </pre>
        ) : (
          p.trim() && (
            <p key={i} className="whitespace-pre-wrap wrap-break-word">
              {p.trim()}
            </p>
          )
        )
      )}
    </div>
  );
}
