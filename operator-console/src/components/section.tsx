// Section shell for the single-page console.
//
// Layout follows the reference deck: a numbered accent badge and an uppercase
// tracked eyebrow, then a large tight-tracked heading, then a muted lede that
// says what the panel is actually showing. Repeating that exact rhythm down the
// page is what makes a long scroll read as one document instead of a stack of
// unrelated widgets.

import { cn } from "@/lib/utils";
import { Reveal } from "@/components/reveal";
import { stagger } from "@/lib/motion-tokens";

export function Section({
  id,
  index,
  eyebrow,
  title,
  lede,
  children,
  className,
}: {
  id: string;
  index: string;
  eyebrow: string;
  title: string;
  lede?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      // scroll-mt keeps an anchored jump from tucking the heading under the
      // sticky header.
      className={cn("scroll-mt-24 py-20 first:pt-12 sm:py-28", className)}
    >
      <Reveal>
        <div className="flex items-center gap-3">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-md text-[13px] font-semibold tabular-nums text-slate-950"
            style={{ backgroundColor: "#17C3A2" }}
          >
            {index}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#17C3A2]">
            {eyebrow}
          </span>
        </div>

        <h2 className="mt-5 text-3xl font-semibold leading-[1.08] tracking-tight text-slate-50 sm:text-[2.6rem]">
          {title}
        </h2>

        {lede && (
          <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-slate-400">
            {lede}
          </p>
        )}
      </Reveal>

      <Reveal delay={stagger} className="mt-10">
        {children}
      </Reveal>
    </section>
  );
}

// The reference deck's "PRO TIP" treatment, reused here for the caveats this
// project cares about stating plainly rather than burying — what a number does
// and does not prove.
export function Callout({
  label = "Note",
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-r-lg border-l-2 border-[#17C3A2] bg-[#17C3A2]/[0.06] px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#17C3A2]">
        {label}
      </div>
      <div className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{children}</div>
    </div>
  );
}

// A floating panel. Every data surface on the page sits in one of these so the
// scroll reads as a sequence of cards rising past a fixed background.
export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      // Shadow set inline rather than as an arbitrary Tailwind value: it is a
      // two-layer shadow, and the comma reads more clearly here than escaped.
      style={{
        boxShadow:
          "inset 0 1px 0 0 rgba(255,255,255,0.03), 0 24px 48px -24px rgba(0,0,0,0.7)",
      }}
      className={cn(
        "rounded-xl border border-slate-800/80 bg-slate-950/40",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 px-5 py-3.5">
      <div className="flex items-baseline gap-3">
        <span className="text-sm font-medium text-slate-200">{title}</span>
        {meta && <span className="text-xs text-slate-500">{meta}</span>}
      </div>
      {action}
    </div>
  );
}
