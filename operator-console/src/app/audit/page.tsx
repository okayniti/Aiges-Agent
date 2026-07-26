"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  entryToFeedRow,
  eventToFeedRow,
  fetchAudit,
  gatewayWsUrl,
  type ChainStatus,
  type FeedRow,
  type GatewayEvent,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeedRowItem } from "@/components/audit/feed-row";

type WsStatus = "connecting" | "live" | "reconnecting";
const MAX_ROWS = 250;

// Merge a row into the feed, newest first, de-duplicated by ledger id, capped so
// the DOM stays light during a long demo.
function mergeRow(rows: FeedRow[], row: FeedRow): FeedRow[] {
  if (rows.some((r) => r.id === row.id)) return rows;
  return [row, ...rows].slice(0, MAX_ROWS);
}

export default function AuditPage() {
  const [chain, setChain] = useState<ChainStatus | null>(null);
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rows appended live since the chain was last verified. The badge reflects the
  // last verification; this tells the operator how far the head has moved since,
  // so they know a re-verify covers new ground rather than pretending it's current.
  const [sinceVerify, setSinceVerify] = useState(0);

  // Live rows animate; snapshot rows do not. Track which ids arrived live.
  const freshIds = useRef<Set<number>>(new Set());
  const closedByUs = useRef(false);

  const verify = useCallback(async () => {
    setVerifying(true);
    try {
      const snapshot = await fetchAudit(100);
      setChain(snapshot.chain);
      setSinceVerify(0);
      setRows((prev) => {
        let next = prev;
        // Fold in any snapshot rows not already shown (e.g. on first load).
        // snapshot.entries arrives newest-first; mergeRow prepends, so folding
        // in that same order would prepend the newest row first and the
        // oldest last, ending up oldest-first. Iterate oldest-to-newest
        // instead, so the newest entry is prepended last and lands on top.
        for (const entry of [...snapshot.entries].reverse()) {
          next = mergeRow(next, entryToFeedRow(entry));
        }
        return next;
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "verify failed");
    } finally {
      setVerifying(false);
    }
  }, []);

  useEffect(() => {
    closedByUs.current = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      const socket = new WebSocket(gatewayWsUrl());
      socket.onopen = () => setWsStatus("live");
      socket.onmessage = (msg) => {
        try {
          const event: GatewayEvent = JSON.parse(msg.data);
          const row = eventToFeedRow(event);
          freshIds.current.add(row.id);
          setRows((prev) => {
            if (prev.some((r) => r.id === row.id)) return prev;
            setSinceVerify((n) => n + 1);
            return mergeRow(prev, row);
          });
        } catch {
          // ignore malformed frames
        }
      };
      socket.onclose = () => {
        if (closedByUs.current) return;
        setWsStatus("reconnecting");
        reconnectTimer = setTimeout(connect, 2000);
      };
      socket.onerror = () => socket.close();
    }

    void verify();
    connect();

    return () => {
      closedByUs.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [verify]);

  const allowed = rows.filter((r) => r.agent_role !== "operator" && r.allowed).length;
  const denied = rows.filter((r) => r.agent_role !== "operator" && !r.allowed).length;
  const operator = rows.filter((r) => r.agent_role === "operator").length;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Live Audit Feed</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every decision and operator action, appended to the hash-chained ledger.
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={
              "inline-block size-2 rounded-full " +
              (wsStatus === "live"
                ? "bg-[#17C3A2]"
                : wsStatus === "reconnecting"
                  ? "bg-amber-400"
                  : "bg-slate-500")
            }
          />
          {wsStatus}
        </span>
      </div>

      {/* Chain integrity badge */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 px-4 py-3">
        <div className="flex items-center gap-3">
          {chain === null ? (
            <Badge variant="outline">verifying…</Badge>
          ) : chain.intact ? (
            <Badge style={{ backgroundColor: "#17C3A2", color: "#020617" }}>
              CHAIN INTACT
            </Badge>
          ) : (
            <Badge variant="destructive">
              CHAIN TAMPERED — breaks at #{chain.broken_at}
            </Badge>
          )}
          {chain && (
            <span className="text-xs text-muted-foreground">
              {chain.rows.toLocaleString()} rows verified
              {chain.head ? ` · head ${chain.head.slice(0, 12)}` : ""}
              {sinceVerify > 0 ? ` · +${sinceVerify} appended since` : ""}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" disabled={verifying} onClick={verify}>
          {verifying ? "Verifying…" : "Re-verify chain"}
        </Button>
      </div>

      {/* Window counters */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>
          <span className="font-mono text-[#17C3A2]">{allowed}</span> allowed
        </span>
        <span>
          <span className="font-mono text-rose-400">{denied}</span> denied
        </span>
        <span>
          <span className="font-mono">{operator}</span> operator
        </span>
        <span className="ml-auto">showing last {rows.length}</span>
      </div>

      {/* Feed */}
      <div className="overflow-hidden rounded-lg border border-slate-800">
        <div className="grid grid-cols-[64px_84px_1fr_120px_88px_1fr] gap-2 border-b border-slate-800 bg-slate-900/50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>id</span>
          <span>time</span>
          <span>agent</span>
          <span>action</span>
          <span className="text-right">amount</span>
          <span className="text-right">outcome · hash</span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {rows.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              {error ? `Gateway unreachable: ${error}` : "Waiting for ledger activity…"}
            </div>
          ) : (
            rows.map((row) => (
              <FeedRowItem key={row.id} row={row} fresh={freshIds.current.has(row.id)} />
            ))
          )}
        </div>
      </div>

      {error && rows.length > 0 && (
        <p className="text-xs text-rose-400">Last error: {error}</p>
      )}
    </div>
  );
}
