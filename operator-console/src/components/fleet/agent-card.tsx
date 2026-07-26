"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

import type { Agent } from "@/lib/api";
import { duration } from "@/lib/motion-tokens";
import { Badge } from "@/components/ui/badge";

const ACCENT = "#17C3A2";
const REVOKED = "#f43f5e";

// Status and spend for one agent. Revocation controls deliberately are not here
// — every way to halt an agent lives together in the Emergency Stop section, so
// an operator looking for the brakes has one place to look.
export function AgentCard({ agent }: { agent: Agent }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const spentRef = useRef<HTMLSpanElement>(null);
  const mounted = useRef(false);

  const cap = agent.cap === null ? null : Number(agent.cap);
  const spent = Number(agent.spent);
  const pct = cap && cap > 0 ? Math.min((spent / cap) * 100, 100) : 0;

  // Flash the card when its revoked state flips: rose when killed, teal when
  // restored. Skipped on first render so the initial paint is calm.
  useEffect(() => {
    if (!mounted.current || !overlayRef.current) return;
    gsap.fromTo(
      overlayRef.current,
      { opacity: 0.4, backgroundColor: agent.revoked ? REVOKED : ACCENT },
      { opacity: 0, duration: duration.slow, ease: "power2.out" },
    );
  }, [agent.revoked]);

  // Pop the spend figure each time it moves, so allowed transfers register
  // visually even when they scroll past quickly in the feed.
  useEffect(() => {
    if (!mounted.current || !spentRef.current) return;
    gsap.fromTo(
      spentRef.current,
      { color: ACCENT },
      { color: "inherit", duration: duration.base, ease: "power1.out" },
    );
  }, [agent.spent]);

  useEffect(() => {
    mounted.current = true;
  }, []);

  return (
    <div
      style={{
        boxShadow:
          "inset 0 1px 0 0 rgba(255,255,255,0.03), 0 20px 40px -24px rgba(0,0,0,0.7)",
      }}
      className="relative overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40 p-5"
    >
      <div
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 z-10 opacity-0"
        aria-hidden
      />

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[15px] text-slate-100">{agent.id}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">
            {agent.role}
          </div>
        </div>
        {agent.revoked ? (
          <Badge variant="destructive">REVOKED</Badge>
        ) : (
          <Badge style={{ backgroundColor: ACCENT, color: "#020617" }}>LIVE</Badge>
        )}
      </div>

      <div className="mt-6 flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-[0.14em] text-slate-500">Spent</span>
        <span className="text-sm">
          <span ref={spentRef} className="font-mono text-lg tabular-nums text-slate-100">
            {spent.toFixed(2)}
          </span>
          <span className="text-slate-500"> / {cap === null ? "—" : cap.toFixed(2)}</span>
        </span>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{
            width: `${pct}%`,
            backgroundColor: agent.revoked ? REVOKED : ACCENT,
          }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
        <span>
          Remaining{" "}
          {agent.remaining === null ? "—" : Number(agent.remaining).toFixed(2)}
        </span>
        <span
          title={`At load: Redis ${agent.spend_reconciliation.redis}, ledger ${agent.spend_reconciliation.ledger}`}
        >
          {agent.spend_reconciliation.agrees_to_the_cent
            ? "Redis ≡ ledger"
            : "Redis ≠ ledger"}
        </span>
      </div>
    </div>
  );
}
