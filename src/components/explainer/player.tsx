import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { Captions, Clapperboard, Download, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import type { Working } from "@acadkit/core/working";
import { useResetOn } from "@/hooks/useResetOn";
import { captionAt, captionUpTo, nextStep, STAGE, stepDuration } from "@/lib/explainer";
import { recordExplainer, videoType } from "@/lib/explainerVideo";
import { saveFile } from "@/lib/saveFile";
import { canSpeak, speak } from "@/lib/speech";
import { cn } from "@/lib/utils";

/** What a scene draws from: the working's figures, the step being played, and how many steps there are. */
export interface SceneProps {
  figures: Record<string, number>;
  step: number;
  count: number;
}

const CAPTIONS_KEY = "acadkit:captions";
const VOICE_KEY = "acadkit:voice";
const TICK_MS = 80;
/** After a spoken sentence, a beat before the next step. */
const BEAT_MS = 500;

/** A choice kept on the device: `fallback` where the browser keeps nothing. */
function stored(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "on";
  } catch {
    return fallback;
  }
}
function store(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? "on" : "off");
  } catch {
    // A browser that keeps nothing still has the choice for now.
  }
}

/**
 * A number's working played as a scene (src/lib/explainer.ts): the scene's
 * SVG on a 16:9 stage, the step's sentence and sum under it, and the
 * controls. It plays through on its own, each step up long enough to read.
 * Captions under the scene bring the sentence out a word at a time while it
 * plays, as subtitles would; CC turns them off, remembered on the device.
 * The voice, off unless turned on (and remembered), speaks each sentence on
 * the device; then a step moves on when it's said, and captions follow it.
 * Where the browser can record, "Make a video" plays it from the start into
 * a silent video with the sentences drawn in (src/lib/explainerVideo.ts),
 * and "Save video" saves it: a second tap, since iOS shares only from one.
 * Where the device asks for reduced motion, it's stills instead (ExplainerStills).
 */
interface PlayerProps {
  title: string;
  working: Working<unknown>;
  scene: (props: SceneProps) => ReactNode;
  autoPlay?: boolean;
  initialStep?: number;
}

/** The explainer: played, or as stills where the device asks for reduced motion. */
export function ExplainerPlayer(props: PlayerProps) {
  return useReducedMotion() ? <ExplainerStills {...props} /> : <Player {...props} />;
}

/**
 * The reduced-motion version: every step as a still of its scene, with its
 * sentence and sum under it, to read at your own pace. Nothing moves and
 * nothing plays on its own.
 */
export function ExplainerStills({ title, working, scene: Scene }: PlayerProps) {
  const { steps, figures } = working;
  return (
    <figure className="space-y-4" aria-label={title}>
      <ol className="space-y-4">
        {steps.map((s, i) => (
          <li key={i} className="space-y-2">
            <svg viewBox={`0 0 ${STAGE.width} ${STAGE.height}`} className="w-full rounded-2xl bg-surface-2" role="img" aria-label={s.say}>
              <Scene figures={figures} step={i} count={steps.length} />
            </svg>
            <p className="text-sm font-semibold leading-snug">
              <span className="mr-1.5 text-muted">{i + 1}.</span>
              {s.say}
            </p>
            {s.sum && <p className="font-mono text-xs text-muted">{s.sum}</p>}
          </li>
        ))}
      </ol>
    </figure>
  );
}

function Player({ title, working, scene: Scene, autoPlay = true, initialStep = 0 }: PlayerProps) {
  const { steps, figures } = working;
  const [step, setStep] = useState(initialStep);
  const [playing, setPlaying] = useState(autoPlay);
  const [captions, setCaptions] = useState(() => stored(CAPTIONS_KEY, true));
  const [voice, setVoice] = useState(() => stored(VOICE_KEY, false));
  const [video, setVideo] = useState<{ state: "idle" } | { state: "recording" } | { state: "ready"; blob: Blob; ext: string }>({ state: "idle" });
  const recording = video.state === "recording";
  // A recording plays at reading pace: speech can't be recorded.
  const speaking = playing && voice && canSpeak() && !recording;
  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // What the recorder reads each frame, and when to stop.
  const sayRef = useRef(steps[step].say);
  const endedRef = useRef(false);
  useEffect(() => {
    sayRef.current = steps[step].say;
  }, [step, steps]);
  const finish = () => {
    endedRef.current = true;
    setPlaying(false);
  };
  // Characters spoken of the step's sentence, for the captions.
  const [spoken, setSpoken] = useState(0);
  useResetOn(`${step}:${speaking}`, () => setSpoken(0));

  // Without a voice, each step is up long enough to read.
  useEffect(() => {
    if (!playing || speaking) return;
    const t = setTimeout(() => {
      const next = nextStep(step, steps);
      if (next === null) finish();
      else setStep(next);
    }, stepDuration(steps[step]));
    return () => clearTimeout(t);
  }, [playing, speaking, step, steps]);

  // With one, a step moves on a beat after its sentence is said.
  // A browser that never says it's done moves on anyway, at twice the step's reading time.
  useEffect(() => {
    if (!speaking) return;
    let beat: ReturnType<typeof setTimeout> | undefined;
    const advance = () => {
      clearTimeout(beat);
      clearTimeout(guard);
      const next = nextStep(step, steps);
      if (next === null) finish();
      else setStep(next);
    };
    const guard = setTimeout(advance, Math.max(6000, 2 * stepDuration(steps[step])));
    const stop = speak(steps[step].say, {
      onWord: setSpoken,
      onEnd: () => {
        clearTimeout(guard);
        beat = setTimeout(advance, BEAT_MS);
      },
    });
    return () => {
      stop();
      clearTimeout(beat);
      clearTimeout(guard);
    };
  }, [speaking, step, steps]);

  const go = (n: number) => {
    setStep(Math.min(steps.length - 1, Math.max(0, n)));
    setPlaying(false);
  };
  // At the end, Play starts over.
  const toggle = () => {
    if (playing) return setPlaying(false);
    if (step === steps.length - 1) setStep(0);
    setPlaying(true);
  };
  const current = steps[step];
  const toggleCaptions = () => {
    setCaptions(!captions);
    store(CAPTIONS_KEY, !captions);
  };
  const toggleVoice = () => {
    setVoice(!voice);
    store(VOICE_KEY, !voice);
  };
  const type = typeof MediaRecorder === "undefined" ? null : videoType((t) => MediaRecorder.isTypeSupported(t));
  const makeVideo = async () => {
    if (!type || !svgRef.current || !stageRef.current) return;
    const root = getComputedStyle(document.documentElement);
    const colors = {
      stage: getComputedStyle(stageRef.current).backgroundColor,
      ink: root.getPropertyValue("--color-ink").trim() || "#111",
      font: getComputedStyle(document.body).fontFamily,
    };
    endedRef.current = false;
    setStep(0);
    setPlaying(true);
    setVideo({ state: "recording" });
    try {
      const blob = await recordExplainer({ svg: svgRef.current, caption: () => sayRef.current, done: () => endedRef.current, colors, type });
      setVideo({ state: "ready", blob, ext: type.ext });
    } catch {
      setVideo({ state: "idle" });
    }
  };
  const button = "flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-surface-2 disabled:opacity-30";
  return (
    <figure className="space-y-3" aria-label={title}>
      <div ref={stageRef} className="overflow-hidden rounded-2xl bg-surface-2">
        <svg ref={svgRef} viewBox={`0 0 ${STAGE.width} ${STAGE.height}`} className="w-full" role="img" aria-label={current.say}>
          <Scene figures={figures} step={step} count={steps.length} />
        </svg>
        {/* Captions in a strip of their own, so they never cover the scene; the words out so far. */}
        {captions && <CaptionStrip key={`${step}:${playing}`} say={current.say} playing={playing} spoken={speaking ? spoken : null} />}
      </div>
      <figcaption className="min-h-16 space-y-1" aria-live="polite">
        <p className="text-sm font-semibold leading-snug">{current.say}</p>
        {current.sum && <p className="font-mono text-xs text-muted">{current.sum}</p>}
      </figcaption>
      <div className="flex items-center gap-1">
        <button type="button" className={button} onClick={() => go(step - 1)} disabled={step === 0 || recording} aria-label="Back a step">
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={button}
          onClick={toggle}
          disabled={recording}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button type="button" className={button} onClick={() => go(step + 1)} disabled={step === steps.length - 1 || recording} aria-label="Next step">
          <SkipForward className="h-4 w-4" />
        </button>
        <button type="button" className={cn(button, captions && "bg-surface-2")} onClick={toggleCaptions} aria-pressed={captions} aria-label="Captions">
          <Captions className="h-4 w-4" />
        </button>
        {canSpeak() && (
          <button type="button" className={cn(button, voice && "bg-surface-2")} onClick={toggleVoice} aria-pressed={voice} aria-label="Voice">
            {voice ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
        )}
        {type &&
          (video.state === "ready" ? (
            <button
              type="button"
              className="flex h-9 items-center gap-1.5 rounded-full bg-ink px-3 text-xs font-semibold text-bg"
              onClick={() => {
                saveFile(video.blob, `${title}.${video.ext}`);
                setVideo({ state: "idle" });
              }}
            >
              <Download className="h-3.5 w-3.5" /> Save video
            </button>
          ) : (
            <button
              type="button"
              className={cn(button, "w-auto gap-1.5 px-2 text-xs font-semibold")}
              onClick={makeVideo}
              disabled={recording}
              aria-label={recording ? "Recording" : "Make a video"}
            >
              <Clapperboard className="h-4 w-4" />
              <span className={cn(!recording && "hidden sm:inline")}>{recording ? "Recording…" : "Make a video"}</span>
            </button>
          ))}
        <div className="ml-auto flex items-center gap-1.5">
          {steps.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              disabled={recording}
              aria-label={`Step ${i + 1} of ${steps.length}`}
              aria-current={i === step ? "step" : undefined}
              className={cn("h-2 rounded-full transition-all", i === step ? "w-5 bg-ink" : "w-2 bg-ink/25")}
            />
          ))}
        </div>
      </div>
    </figure>
  );
}

/**
 * A step's caption, its words out as they're spoken (`spoken` characters)
 * or as they'd be read while playing, the whole sentence while paused. It
 * keeps its own time, so its ticks don't redraw the scene; the player
 * starts a new one with each step and on Play. Time is counted in ticks
 * rather than read off the clock, which tests hold still.
 */
function CaptionStrip({ say, playing, spoken }: { say: string; playing: boolean; spoken: number | null }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setElapsed((e) => e + TICK_MS), TICK_MS);
    return () => clearInterval(t);
  }, [playing]);
  const { words, shown } = !playing ? { words: say.split(/\s+/), shown: Infinity } : spoken !== null ? captionUpTo(say, spoken) : captionAt(say, elapsed);
  return (
    <p className="flex h-12 items-center justify-center px-4 pb-2 text-center text-xs font-semibold leading-snug" aria-hidden>
      {shown > 0 && <span className="rounded-md bg-ink/85 box-decoration-clone px-1.5 py-0.5 text-bg">{words.slice(0, shown).join(" ")}</span>}
    </p>
  );
}
