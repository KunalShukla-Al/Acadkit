/** The account's settings row, and setting up a new account (seeded or from onboarding). */

import { SEED_SUBJECTS, SEMESTER_END, SEMESTER_START } from "@acadkit/core/semester";
import type { Settings } from "@acadkit/core/types";
import type { DraftSubject } from "@/lib/onboarding";
import { supabase } from "@/lib/supabase";
import { throwIf } from "@/api/db";

export async function fetchSettings(pin: string): Promise<Settings | null> {
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("device_id", pin)
    .maybeSingle();
  throwIf(error);
  return data ?? null;
}

/** An upsert, not an update: an update against a PIN with no settings row matches nothing and succeeds, so every change made on such an account was silently thrown away. */
export async function updateSettings(pin: string, patch: Partial<Settings>): Promise<void> {
  const { error } = await supabase
    .from("settings")
    .upsert({ ...patch, device_id: pin }, { onConflict: "device_id" });
  throwIf(error);
}

/** First-time setup for a PIN you have already claimed: settings row + starter subjects. */
export async function seedAccount(pin: string): Promise<void> {
  if (!(await fetchSettings(pin))) {
    const { error } = await supabase.from("settings").insert({
      device_id: pin,
      semester: 3,
      sem_start: SEMESTER_START,
      sem_end: SEMESTER_END,
      declared_holidays: [],
    });
    throwIf(error);
  }
  const { count, error } = await supabase
    .from("subjects")
    .select("id", { count: "exact", head: true })
    .eq("device_id", pin);
  throwIf(error);
  if (!count) {
    const { error: subErr } = await supabase
      .from("subjects")
      .insert(SEED_SUBJECTS.map((s) => ({ ...s, device_id: pin })));
    throwIf(subErr);
  }
}

export interface AccountSetup {
  name: string;
  semester: number;
  min_attendance: number;
  target_sgpa: number | null;
  subjects: DraftSubject[];
}

/**
 * A new account from the onboarding answers. Safe to run again after a
 * failure halfway: settings are updated rather than duplicated, and the
 * subjects go in only while the account has none.
 */
export async function setupAccount(pin: string, setup: AccountSetup): Promise<void> {
  const profile = {
    name: setup.name.trim() || null,
    semester: setup.semester,
    min_attendance: setup.min_attendance,
    ...(setup.target_sgpa !== null ? { target_sgpa: setup.target_sgpa } : {}),
  };
  if (await fetchSettings(pin)) {
    const { error } = await supabase.from("settings").update(profile).eq("device_id", pin);
    throwIf(error);
  } else {
    const { error } = await supabase.from("settings").insert({
      device_id: pin,
      ...profile,
      sem_start: SEMESTER_START,
      sem_end: SEMESTER_END,
      declared_holidays: [],
    });
    throwIf(error);
  }
  if (!setup.subjects.length) return;
  const { count, error } = await supabase
    .from("subjects")
    .select("id", { count: "exact", head: true })
    .eq("device_id", pin);
  throwIf(error);
  if (count) return;
  const { error: subErr } = await supabase.from("subjects").insert(
    setup.subjects.map((s) => ({
      device_id: pin,
      code: s.code,
      name: s.name.trim(),
      credits: s.credits ?? 0,
      type: s.type,
      faculty: s.faculty,
      color_hex: s.color_hex,
    }))
  );
  throwIf(subErr);
}
