import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getExistingSubscription,
  movePushToCurrentKey,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  type PushStore,
} from "@/lib/push";
import { usePin } from "@/hooks/useData";
import { deletePushSubscription, savePushSubscription } from "@/api/push";

const pushStore = (pin: string): PushStore => ({
  save: (sub) => savePushSubscription(pin, sub),
  remove: deletePushSubscription,
});

/**
 * At start, move this browser's reminders onto the current VAPID key if
 * they are on the original one (movePushToCurrentKey). Silent: no prompt,
 * no toast, nothing at all without a subscription.
 */
export function usePushKeyMove(): void {
  const pin = usePin();
  useEffect(() => {
    if (pin) void movePushToCurrentKey(pushStore(pin));
  }, [pin]);
}

export function usePush() {
  const pin = usePin();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    // Also where a subscription still on the original key gets moved, if
    // the app shell's attempt at start hasn't already.
    const check = pin
      ? movePushToCurrentKey(pushStore(pin))
      : getExistingSubscription().then((s) => !!s, () => false);
    void check.then((has) => {
      if (alive) setSubscribed(has);
    });
    return () => {
      alive = false;
    };
  }, [pin]);

  async function enable() {
    setBusy(true);
    try {
      const sub = await subscribeToPush();
      await savePushSubscription(pin, sub);
      setSubscribed(true);
      toast.success("Reminders on", {
        description: "Class, deadline and attendance nudges will arrive here.",
      });
    } catch (err) {
      toast.error("Couldn't turn on notifications", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const endpoint = await unsubscribeFromPush();
      if (endpoint) await deletePushSubscription(endpoint);
      setSubscribed(false);
      toast.success("Reminders off");
    } catch (err) {
      toast.error("Couldn't turn off notifications", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  const permission =
    typeof Notification !== "undefined" ? Notification.permission : "default";

  return { supported: pushSupported, subscribed, busy, permission, enable, disable };
}
