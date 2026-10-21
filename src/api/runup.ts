/** The Run-up plan's ticked tasks (migration 043). */

import { supabase } from "@/lib/supabase";
import { isMissingTable, throwIf } from "@/api/db";

export interface PlanTick {
  task_id: string;
  done_at: string;
}

/** Run-up tasks ticked as done. A project that hasn't run 043 has none, rather than an error on every visit. */
export async function fetchPlanTicks(pin: string): Promise<PlanTick[]> {
  const { data, error } = await supabase.from("plan_ticks").select("task_id, done_at").eq("device_id", pin);
  if (isMissingTable(error)) return [];
  throwIf(error);
  return data ?? [];
}

/** Tick inserts a row (a second tick is a no-op), untick deletes it. */
export async function setPlanTick(pin: string, v: { task_id: string; done: boolean }): Promise<void> {
  if (v.done) {
    const { error } = await supabase
      .from("plan_ticks")
      .upsert({ device_id: pin, task_id: v.task_id }, { onConflict: "device_id,task_id", ignoreDuplicates: true });
    throwIf(error);
  } else {
    const { error } = await supabase.from("plan_ticks").delete().eq("device_id", pin).eq("task_id", v.task_id);
    throwIf(error);
  }
}
