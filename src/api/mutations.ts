import type { QueryClient } from "@tanstack/react-query";
import { updateSettings } from "@/api/settings";
import { deleteSubject, insertSubject, updateSubject } from "@/api/subjects";
import { deleteSlot, insertSlot, updateSlot } from "@/api/timetable";
import { deleteAttendance, upsertAttendance } from "@/api/attendance";
import { saveCardReview } from "@/api/cards";
import { deleteDeadline, insertDeadline, updateDeadline } from "@/api/deadlines";
import { deleteArchive } from "@/api/history";
import { deleteMark, insertMark, updateMark } from "@/api/marks";
import { setPlanTick } from "@/api/runup";
import { setSuggestionStatus } from "@/api/suggestions";

/** Every write the app can make, addressable by name. */
export type MutationName = keyof typeof MUTATION_FNS;

/* eslint-disable @typescript-eslint/no-explicit-any */
export const MUTATION_FNS = {
  "settings.update": (pin: string, v: any) => updateSettings(pin, v),

  "subjects.add": (pin: string, v: any) => insertSubject(pin, v),
  "subjects.update": (_pin: string, v: any) => updateSubject(v.id, v.patch),
  "subjects.delete": (_pin: string, v: any) => deleteSubject(v),

  "timetable.add": (pin: string, v: any) => insertSlot(pin, v),
  "timetable.update": (_pin: string, v: any) => updateSlot(v.id, v.patch),
  "timetable.delete": (_pin: string, v: any) => deleteSlot(v),

  "attendance.mark": (pin: string, v: any) => upsertAttendance(pin, v),
  "attendance.unmark": (pin: string, v: any) => deleteAttendance(pin, v),

  "marks.add": (pin: string, v: any) => insertMark(pin, v),
  "marks.update": (_pin: string, v: any) => updateMark(v.id, v.patch),
  "marks.delete": (_pin: string, v: any) => deleteMark(v),

  "deadlines.add": (pin: string, v: any) => insertDeadline(pin, v),
  "deadlines.update": (_pin: string, v: any) => updateDeadline(v.id, v.patch),
  "deadlines.delete": (_pin: string, v: any) => deleteDeadline(v),

  "archives.delete": (_pin: string, v: any) => deleteArchive(v),


  "runup.tick": (pin: string, v: any) => setPlanTick(pin, v),

  "cards.review": (pin: string, v: any) => saveCardReview(pin, v),

  "suggestions.status": (_pin: string, v: any) =>
    setSuggestionStatus(v.id, v.status, v.decided_at ?? null),
} satisfies Record<string, (pin: string, vars: any) => Promise<unknown>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** What a paused mutation carries across a restart: which write it was, and whose data it belongs to. */
export interface MutationEnvelope<TVars> {
  pin: string;
  vars: TVars;
}

/** Every named write runs in one queue, in the order it was made. */
export const WRITE_SCOPE = "acadkit-writes";

/** Teach the client how to run each mutation by name, so mutations rehydrated from storage have a function to call. */
export function registerMutationDefaults(qc: QueryClient): void {
  for (const name of Object.keys(MUTATION_FNS) as MutationName[]) {
    qc.setMutationDefaults([name], {
      scope: { id: WRITE_SCOPE },
      mutationFn: (envelope: unknown) => {
        const { pin, vars } = envelope as MutationEnvelope<unknown>;
        return MUTATION_FNS[name](pin, vars);
      },
    });
  }
}
