import { BookOpen, CircleCheck, GraduationCap, Sun, Table2, type LucideIcon } from "lucide-react";
import { SCREENS, type ScreenId } from "@/lib/screens";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const SCREEN_ICONS: Record<ScreenId, LucideIcon> = { today: Sun, timetable: Table2, attendance: CircleCheck, marks: GraduationCap, study: BookOpen };

/** The phone's bar and the Mac's sidebar: the five tabs. */
export const NAV_ITEMS: NavItem[] = SCREENS.map((s) => ({ to: s.to, label: s.label, icon: SCREEN_ICONS[s.id] }));
