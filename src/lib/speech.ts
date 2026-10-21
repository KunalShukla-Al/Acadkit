/**
 * The explainers' optional voice (src/components/explainer/player.tsx):
 * the browser's speech synthesis, with a voice that runs on the device
 * where there is one, so nothing is sent anywhere to be spoken.
 */

export interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
  default?: boolean;
}

/** Whether this browser can speak at all. */
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

const ORDER = ["en-IN", "en-GB", "en-US"];

/**
 * The voice to speak with: one on the device, in English, Indian English
 * first, then British, then American, then any; a network voice only when
 * there's no local one. Null without an English voice.
 */
export function pickVoice<V extends VoiceLike>(voices: V[]): V | null {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const rank = (v: V) => (v.localService ? 0 : 10) + (ORDER.indexOf(v.lang.replace("_", "-")) + 1 || ORDER.length + 1);
  return [...english].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

/**
 * Says `text`, calling `onWord` with how many characters are spoken so far
 * and `onEnd` when it's done (or fails). Returns a function that stops it.
 */
export function speak(text: string, { onWord, onEnd }: { onWord?: (chars: number) => void; onEnd: () => void }): () => void {
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(synth.getVoices());
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onEnd();
  };
  u.onboundary = (e) => onWord?.(e.charIndex + (e.charLength ?? 0));
  u.onend = finish;
  u.onerror = finish;
  synth.cancel();
  synth.speak(u);
  return () => {
    done = true;
    synth.cancel();
  };
}
