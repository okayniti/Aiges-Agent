"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

import type { FeedRow } from "@/lib/api";
import { duration } from "@/lib/motion-tokens";
import { Badge } from "@/components/ui/badge";

const ACCENT = "#17C3A2";

function shortHash(hash: string) {
  return hash.slice(0, 10);
}

function time(ts: string) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleTimeString();
}

// One ledger row. `fresh` rows (arrived live over the WebSocket) get a GSAP
// entrance so the eye can follow the stream; the initial snapshot rows render
// without animation so the first paint is still.
export function FeedRowItem({ row, fresh }: { row: FeedRow; fresh: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fresh || !ref.current) return;
    gsap.from(ref.current, {
      opacity: 0,
      y: -8,
      duration: duration.base,
      ease: "power2.out",
    });
    gsap.fromTo(
      ref.current,
      { backgroundColor: "rgba(23,195,162,0.14)" },
      { backgroundColor: "rgba(0,0,0,0)", duration: duration.slow, ease: "power2.out" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isOperator = row.agent_role === "operator";

  return (
    <div
      ref={ref}
      className="grid grid-cols-[64px_84px_1fr_120px_88px_1fr] items-center gap-2 border-b border-slate-800/60 px-3 py-1.5 text-xs"
    >
      <span className="font-mono text-muted-foreground">#{row.id}</span>
      <span className="font-mono text-muted-foreground">{time(row.ts)}</span>
      <span className="flex items-center gap-2 truncate">
        <span className="font-mono">{row.agent_id}</span>
        <Badge variant={isOperator ? "outline" : "secondary"} className="shrink-0">
          {row.agent_role}
        </Badge>
      </span>
      <span className="truncate font-mono">{row.action}</span>
      <span className="text-right font-mono tabular-nums text-muted-foreground">
        {row.amount === null ? "—" : Number(row.amount).toFixed(2)}
      </span>
      <span className="flex items-center justify-end gap-2 truncate">
        {isOperator ? (
          <Badge style={{ backgroundColor: ACCENT, color: "#020617" }}>operator</Badge>
        ) : row.allowed ? (
          <Badge style={{ backgroundColor: ACCENT, color: "#020617" }}>ALLOW</Badge>
        ) : (
          <Badge variant="destructive">DENY {row.deny_reason}</Badge>
        )}
        <span
          className="font-mono text-muted-foreground/70"
          title={`hash ${row.hash}${row.detail ? ` · ${row.detail}` : ""}`}
        >
          {shortHash(row.hash)}
        </span>
      </span>
    </div>
  );
}
