import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import {
  animateSingleValue,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
  type PanInfo,
} from "motion/react";
import { Check, PartyPopper, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { useFlashcards } from "@/hooks/useFlashcards";
import { useSaveCardReview } from "@/hooks/useData";
import { useTodayISO } from "@/hooks/useRunup";
import { diffDays } from "@acadkit/core/dates";
import {
  answerText,
  type CardReview,
  type Flashcard,
  isChoice,
  nextReview,
  requeue,
  studyQueue,
  subjectsOf,
} from "@/lib/flashcards";
import { cn, haptic } from "@/lib/utils";

/** How far (px) or how fast (px/s) a card has to be thrown to count as a grade. */
const THROW_DISTANCE = 110;
const THROW_SPEED = 600;

/** How the card reacts to a pick: a hop when it's right, a head-shake when it's wrong. */
const HOP = { scale: [1, 1.045, 1], transition: { duration: 0.34 } };
const SHAKE = { x: [0, -14, 12, -8, 6, -3, 0], transition: { duration: 0.48 } };

interface Slot {
  card: Flashcard;
  /** Unique within the session: a missed card comes back as a fresh card. */
  key: string;
}

interface CardHandle {
  /** Throw the card off to the right (knew it) or the left (again). */
  fling: (knew: boolean) => void;
  reveal: () => void;
  pick: (key: string) => void;
  flipped: () => boolean;
}

const slotsOf = (cards: Flashcard[]): Slot[] => cards.map((card) => ({ card, key: card.id }));

/**
 * The flashcard deck: one card at a time on a small stack. Pick an answer
 * (or tap "Show answer") to flip it, then throw it right if you knew it or
 * left to see it again. Missed cards come round once more in the same
 * sitting, and every review is saved as you go.
 */
export function FlashcardDeck({ onClose }: { onClose: () => void }) {
  const { cards, reviews } = useFlashcards();
  const today = useTodayISO();
  const save = useSaveCardReview();
  const subjects = useMemo(() => subjectsOf(cards), [cards]);
  const [subject, setSubject] = useState<string | null>(null);
  const [queue, setQueue] = useState<Slot[]>(() => slotsOf(studyQueue(cards, reviews, today)));
  const [total, setTotal] = useState(queue.length);
  const [tally, setTally] = useState({ knew: 0, again: 0 });
  const [announce, setAnnounce] = useState("");
  // Which card is showing its answer: the buttons below follow it.
  const [flippedKey, setFlippedKey] = useState<string | null>(null);
  const missed = useRef(new Set<string>());
  const top = useRef<CardHandle>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  // The queue is built from reviews as they stood at the start of a sitting;
  // later reviews only matter when a new sitting starts.
  const latest = useRef(reviews);
  useEffect(() => {
    latest.current = reviews;
  }, [reviews]);

  const start = useCallback(
    (s: string | null) => {
      const next = slotsOf(studyQueue(cards, latest.current, today, { subject: s }));
      setSubject(s);
      setQueue(next);
      setTotal(next.length);
      setTally({ knew: 0, again: 0 });
      missed.current.clear();
    },
    [cards, today]
  );

  const grade = (slot: Slot, knew: boolean) => {
    const next = nextReview(latest.current.get(slot.card.id), knew, today);
    const review: CardReview = { card_id: slot.card.id, ...next, reviewed_at: new Date().toISOString() };
    save.mutate(review);
    setTally((t) => (knew ? { ...t, knew: t.knew + 1 } : { ...t, again: t.again + 1 }));
    const rest = queue.filter((s) => s.key !== slot.key);
    // A first miss comes round once more this sitting; a second waits for the next.
    if (knew || missed.current.has(slot.card.id)) {
      setQueue(rest);
      return;
    }
    missed.current.add(slot.card.id);
    setTotal((n) => n + 1);
    setQueue(requeue(rest, { card: slot.card, key: `${slot.card.id}#again` }));
  };

  // Locked page behind, focus inside, Escape closes.
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => {
      document.body.style.overflow = before;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialog.current) {
        const focusable = [...dialog.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")].filter(
          (el) => !el.closest("[inert]")
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || !top.current) return;
      const onButton = (e.target as HTMLElement | null)?.closest("button");
      const flipped = top.current.flipped();
      if (flipped && e.key === "ArrowRight") top.current.fling(true);
      else if (flipped && e.key === "ArrowLeft") top.current.fling(false);
      else if (!flipped && e.key === " " && !onButton) {
        e.preventDefault();
        top.current.reveal();
      } else if (!flipped && /^[1-4a-dA-D]$/.test(e.key)) {
        const key = /\d/.test(e.key) ? "ABCD"[Number(e.key) - 1] : e.key.toUpperCase();
        top.current.pick(key);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const current = queue[0];
  const done = total - queue.length;
  const freshLeft = useMemo(
    () => cards.some((c) => (subject ? c.subject === subject : true) && !reviews.has(c.id) && !queue.some((s) => s.card.id === c.id)),
    [cards, reviews, queue, subject]
  );
  const nextDue = useMemo(() => {
    const later = [...reviews.values()].map((r) => r.due).filter((d) => d > today).sort();
    return later[0] ?? null;
  }, [reviews, today]);

  return createPortal(
    <motion.div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="flashcards-title"
      data-flashcard-deck
      className="fixed inset-0 z-50 flex flex-col bg-bg/96 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h2 id="flashcards-title" className="text-xl font-extrabold tracking-tight">
              Flashcards
            </h2>
            <p className="tabular text-sm text-muted">
              {current ? `${Math.min(done + 1, total)} of ${total}` : "Nothing waiting"}
            </p>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close flashcards"
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-2 text-ink transition-colors hover:bg-surface-2/70"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        {subjects.length > 1 && (
          <Segmented
            options={[{ value: "", label: "All" }, ...subjects.map((s) => ({ value: s, label: s }))]}
            value={subject ?? ""}
            onChange={(v) => start(v || null)}
            layoutId="flashcard-subject"
          />
        )}

        <div
          className="h-1.5 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-label="Cards done this sitting"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          <motion.div
            className="h-full rounded-full bg-accent"
            animate={{ width: total ? `${(done / total) * 100}%` : "0%" }}
            transition={{ type: "spring", stiffness: 200, damping: 26 }}
          />
        </div>

        <div className="relative flex-1">
          {current ? (
            <>
              {queue.slice(1, 3).map((slot, i) => (
                <motion.div
                  key={slot.key}
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-[min(62dvh,32rem)] rounded-[28px] border bg-surface shadow-card"
                  initial={false}
                  animate={{ scale: 1 - (i + 1) * 0.045, y: (i + 1) * 14, opacity: 1 - (i + 1) * 0.3 }}
                  transition={{ type: "spring", stiffness: 300, damping: 24 }}
                  style={{ zIndex: 2 - i }}
                />
              ))}
              <FlashCard
                key={current.key}
                ref={top}
                card={current.card}
                onFlip={() => setFlippedKey(current.key)}
                onGrade={(knew) => grade(current, knew)}
                onAnnounce={setAnnounce}
              />
            </>
          ) : (
            <Done tally={tally} nextDue={nextDue} today={today} freshLeft={freshLeft} onMore={() => start(subject)} onClose={onClose} />
          )}
        </div>

        {current && <Controls handle={top} card={current.card} flipped={flippedKey === current.key} />}
      </div>
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
    </motion.div>,
    document.body
  );
}

/** The buttons under the card: show the answer first, then Again or Got it. They act through the card, so a tap and a throw by hand run the same code. */
function Controls({ handle, card, flipped }: { handle: React.RefObject<CardHandle | null>; card: Flashcard; flipped: boolean }) {
  if (!flipped)
    return (
      <div className="flex items-center gap-3">
        {isChoice(card) && <p className="flex-1 text-sm text-muted">Pick an answer, or</p>}
        <Button
          variant={isChoice(card) ? "secondary" : "primary"}
          size="lg"
          className={cn(!isChoice(card) && "w-full")}
          onClick={() => handle.current?.reveal()}
        >
          Show answer
        </Button>
      </div>
    );
  return (
    <div className="grid grid-cols-2 gap-3">
      <Button variant="danger" size="lg" onClick={() => handle.current?.fling(false)}>
        <RotateCcw className="h-5 w-5" aria-hidden />
        Again
      </Button>
      <Button size="lg" onClick={() => handle.current?.fling(true)}>
        <Check className="h-5 w-5" aria-hidden />
        Got it
      </Button>
    </div>
  );
}

/** One card: drag it sideways once it's flipped; it tilts with your finger and springs back if you let go early. */
function FlashCard({
  card,
  onFlip,
  onGrade,
  onAnnounce,
  ref,
}: {
  card: Flashcard;
  onFlip: () => void;
  onGrade: (knew: boolean) => void;
  onAnnounce: (text: string) => void;
  ref: Ref<CardHandle>;
}) {
  const reduced = useReducedMotion();
  const [flipped, setFlipped] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const flippedNow = useRef(false);
  const leaving = useRef(false);
  const dragged = useRef(false);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 260], [-16, 16]);
  const knewGlow = useTransform(x, [24, 140], [0, 1]);
  const againGlow = useTransform(x, [-140, -24], [1, 0]);

  const flip = useCallback(() => {
    flippedNow.current = true;
    setFlipped(true);
    onFlip();
  }, [onFlip]);

  const fling = useCallback(
    (knew: boolean, velocity = 0) => {
      if (leaving.current || !flippedNow.current) return;
      leaving.current = true;
      haptic(knew ? 12 : [10, 40, 10]);
      if (reduced) {
        onGrade(knew);
        return;
      }
      const to = (knew ? 1 : -1) * (window.innerWidth + 260);
      // animateSingleValue is animate() for one value, minus the sequence code
      // that animate() would add to the shared motion chunk at start.
      animateSingleValue(x, to, { type: "spring", stiffness: 170, damping: 24, velocity }).then(() => onGrade(knew));
    },
    [onGrade, reduced, x]
  );

  const pick = useCallback(
    (key: string) => {
      if (flippedNow.current || !isChoice(card) || !card.options.some((o) => o.key === key)) return;
      const right = key === card.answer;
      setPicked(key);
      haptic(right ? 10 : [12, 30, 12]);
      onAnnounce(right ? `Right: ${card.answer}, ${answerText(card)}` : `Not quite. The answer is ${card.answer}, ${answerText(card)}`);
      // The flip waits for the bounce or the shake to play, unless motion is off.
      if (reduced) flip();
      else window.setTimeout(flip, right ? 240 : 500);
    },
    [card, flip, onAnnounce, reduced]
  );

  const reveal = useCallback(() => {
    if (flippedNow.current) return;
    onAnnounce(`Answer: ${answerText(card)}`);
    flip();
  }, [card, flip, onAnnounce]);

  useImperativeHandle(ref, () => ({ fling, reveal, pick, flipped: () => flippedNow.current }), [fling, reveal, pick]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const thrown = Math.abs(info.offset.x) > THROW_DISTANCE || Math.abs(info.velocity.x) > THROW_SPEED;
    if (thrown) fling(info.offset.x > 0, info.velocity.x);
    // Let go early and it springs home, overshooting a little.
    else animateSingleValue(x, 0, { type: "spring", stiffness: 520, damping: 15 });
  };

  const source = [card.subject, card.unit ? `Unit ${card.unit}` : null].filter(Boolean).join(" · ");

  return (
    <motion.div
      className="absolute inset-x-0 top-0 z-10 h-[min(62dvh,32rem)] touch-pan-y"
      style={{ x, rotate }}
      initial={{ scale: 0.94, y: 16 }}
      animate={{ scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 22 }}
      drag={flipped ? "x" : false}
      dragMomentum={false}
      onDragStart={() => {
        dragged.current = true;
      }}
      onDragEnd={onDragEnd}
      onPointerDown={() => {
        dragged.current = false;
      }}
      role="group"
      aria-roledescription="flashcard"
      aria-label={source}
    >
      <motion.div
        className="relative h-full w-full"
        animate={picked ? (picked === card.answer ? HOP : SHAKE) : undefined}
        style={{ perspective: 1400 }}
      >
        <motion.div
          className="relative h-full w-full"
          style={{ transformStyle: "preserve-3d" }}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 210, damping: 18 }}
        >
          <Face inert={flipped}>
            <Meta source={source} card={card} />
            <p className="mt-3 whitespace-pre-line text-[17px] font-semibold leading-snug">{card.question}</p>
            {isChoice(card) ? (
              <div className="mt-4 space-y-2">
                {card.options.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => !dragged.current && pick(o.key)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left text-[15px] transition-colors",
                      picked === o.key ? "border-accent bg-accent/12" : "bg-surface-2/50 hover:bg-surface-2"
                    )}
                  >
                    <span className="tabular mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface text-xs font-bold text-muted">
                      {o.key}
                    </span>
                    <span className="whitespace-pre-line">{o.text}</span>
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => !dragged.current && reveal()}
                className="mt-6 w-full rounded-2xl border border-dashed px-4 py-6 text-sm text-muted transition-colors hover:bg-surface-2/60"
              >
                Say it in your head, then show the answer
              </button>
            )}
          </Face>
          <Face inert={!flipped} back>
            <Meta source={source} card={card} />
            <p className="mt-3 text-xs font-bold uppercase tracking-wider text-muted">Answer</p>
            <p className="mt-1 whitespace-pre-line text-[19px] font-bold leading-snug">
              {isChoice(card) && <span className="text-accent-deep">{card.answer} · </span>}
              {answerText(card)}
            </p>
            {picked && (
              <p className={cn("mt-2 text-sm font-semibold", picked === card.answer ? "text-good-deep" : "text-bad-deep")}>
                {picked === card.answer ? "You got it." : `You picked ${picked}.`}
              </p>
            )}
            {card.why && <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink/85">{card.why}</p>}
            <div className="mt-auto pt-4 text-xs text-muted">
              <p className="sr-only">Swipe or use the buttons below: right if you knew it, left to see it again.</p>
              {card.seen.length > 0 && <p>Asked in {card.seen.join(" · ")}</p>}
            </div>
          </Face>
        </motion.div>
      </motion.div>

      {/* What letting go would do, stronger the further you pull: a tinted edge, and a word low on the card where it covers nothing. */}
      <Verdict glow={knewGlow} label="Got it" className="border-good-deep bg-good/8 text-good-deep" />
      <Verdict glow={againGlow} label="Again" className="border-bad-deep bg-bad/8 text-bad-deep" />
    </motion.div>
  );
}

function Verdict({ glow, label, className }: { glow: MotionValue<number>; label: string; className: string }) {
  return (
    <motion.div
      aria-hidden
      style={{ opacity: glow }}
      className={cn("pointer-events-none absolute inset-0 z-20 rounded-[28px] border-[3px]", className)}
    >
      <span className="absolute bottom-[22%] left-1/2 -translate-x-1/2 rounded-xl border-[3px] border-current bg-surface px-4 py-1.5 text-base font-extrabold uppercase tracking-wider">
        {label}
      </span>
    </motion.div>
  );
}

function Face({ children, inert, back }: { children: React.ReactNode; inert: boolean; back?: boolean }) {
  return (
    <div
      inert={inert}
      aria-hidden={inert}
      className="absolute inset-0 flex flex-col overflow-y-auto overscroll-contain rounded-[28px] border bg-surface p-5 shadow-card"
      style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: back ? "rotateY(180deg)" : undefined }}
    >
      {children}
    </div>
  );
}

function Meta({ source, card }: { source: string; card: Flashcard }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
      <span className="rounded-full bg-surface-2 px-2.5 py-1 text-ink">{source}</span>
      {card.seen.length > 1 && (
        <span className="rounded-full bg-accent/15 px-2.5 py-1 text-accent-deep">Asked {card.seen.length}×</span>
      )}
      {card.topic && <span className="truncate text-muted">{card.topic}</span>}
    </div>
  );
}

function Done({
  tally,
  nextDue,
  today,
  freshLeft,
  onMore,
  onClose,
}: {
  tally: { knew: number; again: number };
  nextDue: string | null;
  today: string;
  freshLeft: boolean;
  onMore: () => void;
  onClose: () => void;
}) {
  const days = nextDue ? diffDays(today, nextDue) : null;
  const when = days === null ? null : days === 1 ? "tomorrow" : `in ${days} days`;
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center gap-3 text-center"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <motion.span
        className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 text-accent-deep"
        initial={{ scale: 0.5, rotate: -14 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 11 }}
      >
        <PartyPopper className="h-8 w-8" aria-hidden />
      </motion.span>
      <h3 className="text-lg font-extrabold">All caught up</h3>
      {tally.knew + tally.again > 0 && (
        <p className="tabular text-sm text-muted">
          {tally.knew} known · {tally.again} to see again
        </p>
      )}
      {when && <p className="text-sm text-muted">The next cards are due {when}.</p>}
      <div className="mt-2 flex gap-3">
        {freshLeft && (
          <Button variant="secondary" onClick={onMore}>
            More new cards
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </div>
    </motion.div>
  );
}
