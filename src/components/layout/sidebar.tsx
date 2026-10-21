import { lazy, Suspense } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { NAV_ITEMS, type NavItem } from "@/components/layout/nav-items";
import { DayOrderChip } from "@/components/layout/day-order-chip";
import { screenOf } from "@/lib/screens";
import { cn } from "@/lib/utils";

const row = (active: boolean) =>
  cn(
    "relative flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-colors",
    active ? "text-accent" : "text-muted hover:bg-surface-2/70 hover:text-ink"
  );

function Pill() {
  return (
    <motion.span
      layoutId="sidebar-pill"
      data-nav-pill
      className="absolute inset-0 rounded-2xl bg-accent/10"
      transition={{ type: "spring", stiffness: 450, damping: 35 }}
    />
  );
}

function Item({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link to={item.to} aria-current={active ? "page" : undefined}>
      <span className={row(active)}>
        {active && <Pill />}
        <item.icon className="relative z-10 h-[18px] w-[18px]" strokeWidth={2.2} />
        <span className="relative z-10">{item.label}</span>
      </span>
    </Link>
  );
}

const RunupChip = lazy(() => import("@/components/layout/runup-chip").then((m) => ({ default: m.RunupChip })));

/** The Mac's sidebar: the day order and the Run-up, then the five tabs, each lit for every page it holds. */
export function Sidebar() {
  const { pathname } = useLocation();
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-surface/50 px-4 py-6 lg:flex">
      <div className="flex items-center gap-2.5 px-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand text-brand-ink shadow-pop">
          <Sparkles className="h-[18px] w-[18px]" />
        </div>
        <span className="text-lg font-extrabold tracking-tight">AcadKit</span>
      </div>

      <div className="mt-6 space-y-2 px-1">
        <DayOrderChip expanded />
        <Suspense fallback={null}>
          <RunupChip wide />
        </Suspense>
      </div>

      <nav className="mt-6 flex flex-1 flex-col gap-1" aria-label="Primary">
        {NAV_ITEMS.map((i) => (
          <Item key={i.to} item={i} active={screenOf(pathname) === screenOf(i.to)} />
        ))}
      </nav>
    </aside>
  );
}
