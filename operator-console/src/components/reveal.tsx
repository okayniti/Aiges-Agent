"use client";

// Scroll-reveal wrapper: fade + slight rise as an element enters the viewport.
//
// Plain IntersectionObserver and a CSS transition rather than a scroll-animation
// library. GSAP is already a dependency and is used for the imperative state
// flashes (a card going revoked, a spend figure ticking up), but those fire on a
// state change, not on scroll position. Reveal-on-enter needs no timeline, no
// scrub, and no scroll listener, so a library would be weight without a job.
//
// Only transform and opacity animate — never layout properties — so a reveal
// cannot reflow the page underneath a live feed that is still appending rows.

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { duration, easing } from "@/lib/motion-tokens";

export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  /** Milliseconds to hold before revealing — used to stagger siblings. */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Reduced motion is handled entirely by the motion-reduce: classes below,
    // which pin the element to its revealed values whatever `shown` says. Doing
    // it in CSS rather than branching here means an operations console never
    // withholds live state from someone who asked for less motion, even for the
    // one frame before an effect could run.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setShown(true);
          // Reveal once. A panel that re-hid on scroll-up would mean scrolling
          // away from the kill switch could blank it out.
          observer.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -10% 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      style={{
        transitionProperty: "opacity, transform",
        transitionDuration: `${duration.reveal}s`,
        transitionTimingFunction: easing.standardCss,
        transitionDelay: shown ? `${delay}ms` : "0ms",
        // Promote to its own layer only while there is still a move to make, so
        // the page is not left holding a GPU layer per panel for the whole session.
        willChange: shown ? undefined : "opacity, transform",
      }}
      data-revealed={shown ? "" : undefined}
      className={cn(
        shown ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
        "motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
