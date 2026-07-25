"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

import type { Agent } from "@/lib/api";
import { duration } from "@/lib/motion-tokens";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const ACCENT = "#17C3A2";
const REVOKED = "#f43f5e";

type Props = {
  agent: Agent;
  fleetRevoked: boolean;
  busy: boolean;
  onRevoke: () => void;
  onRestore: () => void;
};

export function AgentCard({ agent, fleetRevoked, busy, onRevoke, onRestore }: Props) {
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
    <Card className="relative">
      <div
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 z-10 opacity-0"
        aria-hidden
      />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="font-mono">{agent.id}</span>
          <Badge variant="outline">{agent.role}</Badge>
        </CardTitle>
        <CardAction>
          {agent.revoked ? (
            <Badge variant="destructive">REVOKED</Badge>
          ) : (
            <Badge className="bg-[#17C3A2] text-slate-950">LIVE</Badge>
          )}
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">Spent</span>
          <span>
            <span ref={spentRef} className="font-mono tabular-nums">
              {spent.toFixed(2)}
            </span>
            <span className="text-muted-foreground">
              {" "}
              / {cap === null ? "—" : cap.toFixed(2)}
            </span>
          </span>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${pct}%`,
              backgroundColor: agent.revoked ? REVOKED : ACCENT,
            }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Remaining {agent.remaining === null ? "—" : Number(agent.remaining).toFixed(2)}
          </span>
          <span
            title={`At load: Redis ${agent.spend_reconciliation.redis}, ledger ${agent.spend_reconciliation.ledger}`}
          >
            {agent.spend_reconciliation.agrees_to_the_cent
              ? "Redis ≡ ledger"
              : "Redis ≠ ledger"}
          </span>
        </div>

        <div className="pt-1">
          {agent.revoked_individually ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={onRestore}
              className="w-full"
            >
              Restore agent
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              disabled={busy || fleetRevoked}
              onClick={onRevoke}
              className="w-full"
            >
              {fleetRevoked ? "Fleet kill active" : "Revoke agent"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
