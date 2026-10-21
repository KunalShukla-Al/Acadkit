import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarPlus, ChevronDown, Copy, Download, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { useDialog } from "@/hooks/useDialog";
import { createFeedToken, feedLinks, fetchFeedToken, revokeFeedToken, SHORTCUTS, shortcutLink } from "@/api/feeds";
import { usePin } from "@/hooks/useData";
import { cn } from "@/lib/utils";


/**
 * The Day Order on the iPhone (supabase/functions/feeds): a calendar
 * subscription, and the two Shortcuts the Mac builds for this account's
 * token (scripts/lib/shortcuts.mjs). The token is the whole credential, so
 * it can be copied for a Shortcut of your own, and revoked.
 */
export function IphoneCard() {
  const pin = usePin();
  const qc = useQueryClient();
  const { confirm } = useDialog();
  const token = useQuery({ queryKey: ["feed-token", pin], queryFn: () => fetchFeedToken(pin) });
  const value = token.data?.token ?? null;
  const shortcuts = useQuery({
    queryKey: ["shortcut-links", pin, value],
    queryFn: () => Promise.all(SHORTCUTS.map((name) => shortcutLink(pin, name))),
    enabled: value !== null,
    // Until the Mac has built them; it checks every 3 minutes.
    refetchInterval: (q) => (q.state.data?.every(Boolean) ? false : 60_000),
    staleTime: 30 * 60_000,
  });

  const [howOpen, setHowOpen] = useState(false);

  const turnOn = useMutation({
    mutationFn: () => createFeedToken(pin),
    onSuccess: (t) => qc.setQueryData(["feed-token", pin], t),
    onError: () => toast.error("Couldn't turn it on. Check your connection and try again."),
  });
  const revoke = useMutation({
    mutationFn: () => revokeFeedToken(pin),
    onSuccess: () => qc.setQueryData(["feed-token", pin], null),
    onError: () => toast.error("Couldn't revoke it. Check your connection and try again."),
  });

  async function onRevoke() {
    const ok = await confirm({
      title: "Revoke the link?",
      body: "The Shortcuts and the calendar stop updating at once. Turning it on again makes a new link, and the Shortcuts need installing again.",
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (ok) revoke.mutate();
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Couldn't copy. Your browser didn't allow it.");
    }
  }

  const links = value ? feedLinks(value) : null;
  return (
    <section className="card space-y-3 p-5">
      <div>
        <p className="text-sm font-bold">iPhone and calendar</p>
        <p className="mt-0.5 text-xs text-muted">Alarm, Do Not Disturb, Siri, Back Tap and every class in Calendar</p>
      </div>

      {token.isLoading ? null : !links ? (
        <>
          <p className="text-xs text-muted">It makes a private link to your timetable, attendance and tests. Keep it to yourself; you can revoke it here.</p>
          <Button className="w-full" disabled={turnOn.isPending} onClick={() => turnOn.mutate()}>
            {turnOn.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
            Turn on
          </Button>
        </>
      ) : (
        <>
          <a href={links.webcal} className={cn(buttonVariants(), "w-full")}>
            <CalendarPlus className="h-4 w-4" /> Add to Calendar
          </a>
          <div className="grid gap-2 sm:grid-cols-2">
            {SHORTCUTS.map((name, i) => {
              const href = shortcuts.data?.[i];
              return href ? (
                <a key={name} href={href} className={buttonVariants({ variant: "secondary" })}>
                  <Download className="h-4 w-4" /> {name}
                </a>
              ) : (
                <span key={name} className={cn(buttonVariants({ variant: "secondary" }), "text-muted")}>
                  <Loader2 className="h-4 w-4 animate-spin" /> {name}
                </span>
              );
            })}
          </div>
          {shortcuts.data && !shortcuts.data.every(Boolean) && (
            <p className="text-xs text-muted">Your Mac builds the Shortcuts for this link. They appear within a few minutes while it's on.</p>
          )}
          <button
            type="button"
            onClick={() => setHowOpen((v) => !v)}
            aria-expanded={howOpen}
            className="flex w-full items-center gap-2 text-left text-xs font-bold text-accent-deep"
          >
            <span className="flex-1">How to set it up</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", howOpen && "rotate-180")} />
          </button>
          {/* In the order a fresh iPhone needs: an automation can't answer a permission prompt, so each runs by hand first. */}
          {howOpen && (
            <ol className="list-decimal space-y-1 pl-5 text-xs text-muted">
              <li>Install each one: tap it, then Add Shortcut.</li>
              <li>
                Run each once from the Shortcuts app and tap Always Allow when it asks to connect, to set an alarm or to turn on Do Not
                Disturb. An automation can't ask, so on a new phone it stops at the first question.
              </li>
              <li>
                In Shortcuts → Automation, add a daily one at 5:00 AM that runs AcadKit Alarm, set to Run Immediately. Each class day it adds
                that day's alarm; iOS turns it off once it has rung.
              </li>
              <li>
                Add another, Run Immediately too, for when any alarm is stopped (a new alarm comes each day, so it can't be picked), that
                runs AcadKit Focus, and one more for arriving at SRM that runs it too. Allow notifications for Shortcuts to see the day it
                says.
              </li>
              <li>Add one for leaving SRM that runs AcadKit Leave: with classes still to come, it asks before marking them absent.</li>
              <li>AcadKit is in the share sheet: share a photo, PDF or file to it and it goes to your study folder's Inbox.</li>
              <li>In Settings → Accessibility → Touch → Back Tap, set Double Tap to AcadKit Screenshot: it sends what's on screen, and a portal attendance page goes straight into the app.</li>
              <li>Say "Hey Siri, AcadKit", then ask: can I skip OS, what do I need in DSA, when is my next test, or I'm absent in OS.</li>
            </ol>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-xs">
            <button type="button" onClick={() => copy(links.today, "Link")} className="inline-flex items-center gap-1.5 font-bold text-accent-deep">
              <Copy className="h-3.5 w-3.5" /> Copy link
            </button>
            <span className="min-w-0 flex-1 text-muted">
              {token.data?.last_used_at ? `Last used ${new Date(token.data.last_used_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : "Not used yet"}
            </span>
            <button type="button" onClick={onRevoke} disabled={revoke.isPending} className="font-bold text-bad-deep disabled:opacity-50">
              Revoke
            </button>
          </div>
        </>
      )}
    </section>
  );
}
