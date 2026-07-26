"use client";

// Sticky header: connection state, scroll-spy anchors, and — always — the
// fleet-wide stop.
//
// The stop is duplicated here on purpose. A single scrolling page reads well as a
// narrative, but an operator should never have to scroll to reach the brakes, so
// the one control that has to be reachable at any scroll position is pinned.

import { useEffect, useState } from "react";

import { useGateway } from "@/lib/gateway-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const ACCENT = "#17C3A2";
const REVOKED = "#f43f5e";

export const SECTIONS = [
  { id: "fleet", label: "Fleet" },
  { id: "feed", label: "Feed" },
  { id: "policy", label: "Policy" },
  { id: "caps", label: "Caps" },
  { id: "stop", label: "Stop" },
  { id: "ledger", label: "Ledger" },
  { id: "latency", label: "Latency" },
] as const;

export function ConsoleHeader() {
  const { wsStatus, fleet, pending, killFleet, reviveFleet } = useGateway();
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  const fleetRevoked = fleet?.fleetRevoked ?? false;

  // Scroll spy over the same IntersectionObserver primitive the reveals use, so
  // the nav highlight and the panel entrances agree about where the reader is.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
    );

    for (const { id } of SECTIONS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/70 bg-[#070c16]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-6">
        <a href="#top" className="flex shrink-0 items-center gap-2.5">
          <span
            className="grid size-6 place-items-center rounded-[5px] text-[11px] font-bold text-slate-950"
            style={{ backgroundColor: ACCENT }}
          >
            A
          </span>
          <span className="text-[13px] font-semibold tracking-tight text-slate-100">
            AegisAgent
          </span>
        </a>

        <nav className="hidden flex-1 items-center gap-1 lg:flex">
          {SECTIONS.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-[12px] transition-colors",
                active === id
                  ? "bg-slate-800/60 text-slate-100"
                  : "text-slate-500 hover:text-slate-300",
              )}
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <span className="hidden items-center gap-1.5 text-[11px] text-slate-500 sm:flex">
            <span
              className={cn(
                "inline-block size-1.5 rounded-full",
                wsStatus === "live"
                  ? "bg-[#17C3A2]"
                  : wsStatus === "reconnecting"
                    ? "bg-amber-400"
                    : "bg-slate-600",
              )}
            />
            {wsStatus}
          </span>

          {fleetRevoked ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending.has("POST /restore fleet")}
              onClick={reviveFleet}
            >
              Restore fleet
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              disabled={pending.has("POST /revoke fleet")}
              onClick={killFleet}
            >
              Kill fleet
            </Button>
          )}
        </div>
      </div>

      {fleetRevoked && (
        <div
          className="px-6 py-1.5 text-center text-[11px] font-medium uppercase tracking-[0.18em]"
          style={{ backgroundColor: "rgba(244,63,94,0.14)", color: REVOKED }}
        >
          Fleet stop engaged — every agent action is being refused
        </div>
      )}
    </header>
  );
}
