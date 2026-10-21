import { useSettings } from "@/hooks/useData";
import { useTone } from "@/hooks/useTone";
import { say, VOICE } from "@/lib/voice";
import { useAppStore } from "@/store/app";

/**
 * Today's title: a greeting by the hour. The brutalist voice prints the
 * line it's correcting above it, struck out.
 */
export function Greeting() {
  const tone = useTone();
  const { data: settings } = useSettings();
  const local = useAppStore((s) => s.name);
  const name = (settings?.name || local || "").trim().split(/\s+/)[0];

  return (
    <div className="px-1">
      {tone === "brutal" && (
        <p aria-hidden className="text-[15px] font-semibold leading-tight text-bad-deep line-through decoration-[1.5px]">
          welcome back, scholar
        </p>
      )}
      <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">{say(VOICE.greeting, tone, new Date().getHours(), name)}</h1>
    </div>
  );
}
