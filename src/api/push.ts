/** Web push subscriptions, one per device endpoint. */

import { PUSH_ENDPOINT_KEY } from "@/lib/push";
import { supabase } from "@/lib/supabase";
import { throwIf } from "@/api/db";

export async function savePushSubscription(
  pin: string,
  sub: { endpoint: string; p256dh: string; auth: string; vapidPublic: string | null }
): Promise<void> {
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        device_id: pin,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        ua: navigator.userAgent,
        // Which key send-reminders signs it with (migration 041); null = the original.
        vapid_public: sub.vapidPublic,
      },
      { onConflict: "endpoint" }
    );
  throwIf(error);
  // This browser's previous subscription, if the push service has since
  // handed it a new one: without this each one stayed on the account (ten
  // iPhone rows by late September), all still accepted by Apple.
  let previous: string | null = null;
  try {
    previous = localStorage.getItem(PUSH_ENDPOINT_KEY);
    localStorage.setItem(PUSH_ENDPOINT_KEY, sub.endpoint);
  } catch {
    /* storage off: nothing to compare against */
  }
  if (previous && previous !== sub.endpoint) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", previous);
  }
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  throwIf(error);
}
