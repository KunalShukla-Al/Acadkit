import { useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { useNavCollapsed } from "@/hooks/useNavCollapsed";
import { useSwipe } from "@/hooks/useSwipe";
import { screenOf } from "@/lib/screens";
import { cn, haptic } from "@/lib/utils";

export function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const collapsed = useNavCollapsed();
  // Each screen is lit for every page it holds.
  const items = NAV_ITEMS;
  const isActive = (to: string) => screenOf(pathname) === screenOf(to);

  // Swiping the bar itself walks the tabs, so you can change page
  // without aiming at a 44px target one-handed.
  const index = items.findIndex((i) => isActive(i.to));
  const go = (delta: number) => {
    if (index < 0) return;
    const next = items[index + delta];
    if (!next) return;
    haptic();
    navigate(next.to);
  };
  const swipe = useSwipe(() => go(1), () => go(-1), { threshold: 40 });

  // The bar's height, as --nav-h, for the corner that sits on top of it; 0 where the bar is hidden (a Mac).
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const root = document.documentElement.style;
    const observer = new ResizeObserver(() => root.setProperty("--nav-h", `${el.getBoundingClientRect().height}px`));
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.removeProperty("--nav-h");
    };
  }, []);

  return (
    <nav
      ref={bar}
      aria-label="Primary"
      /* The safe-area inset is a clearance requirement, not a margin. */
      className="glass fixed inset-x-0 bottom-0 z-30 border-t pb-[max(0.25rem,calc(env(safe-area-inset-bottom)-0.6rem))] lg:hidden"
      data-swipe
      {...swipe}
    >
      <div
        className={cn(
          "mx-auto flex max-w-lg items-stretch justify-around px-1 transition-[padding] duration-200",
          collapsed ? "pb-0.5 pt-1" : "pb-1 pt-1.5"
        )}
      >
        {items.map((item) => {
          const active = isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => haptic()}
              className="relative flex flex-1 basis-0 flex-col items-center gap-1 rounded-2xl py-1.5"
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <motion.span
                  layoutId="bottom-nav-pill"
                  data-nav-pill
                  className="absolute inset-0 rounded-2xl bg-accent/12"
                  transition={{ type: "spring", stiffness: 450, damping: 35 }}
                />
              )}
              <item.icon
                className={cn(
                  "relative z-10 h-[22px] w-[22px] transition-colors",
                  active ? "text-accent" : "text-muted"
                )}
                strokeWidth={active ? 2.4 : 2}
              />
              {/* The label is what goes. The icon and the pill are what
                  make a tab findable at a glance; the word underneath is
                  reassurance you stop needing after the first week. */}
              <motion.span
                initial={false}
                animate={{
                  height: collapsed ? 0 : "auto",
                  opacity: collapsed ? 0 : 1,
                }}
                transition={{ type: "spring", stiffness: 400, damping: 34 }}
                className={cn(
                  "relative z-10 overflow-hidden text-[9.5px] font-bold leading-[1.2] transition-colors",
                  active ? "text-accent" : "text-muted"
                )}
              >
                {item.label}
              </motion.span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
