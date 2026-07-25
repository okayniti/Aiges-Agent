"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";

import {
  fetchFleet,
  gatewayWsUrl,
  revokeAgent,
  restoreAgent,
  revokeFleet,
  restoreFleet,
  type Agent,
  type FleetResponse,
  type GatewayEvent,
} from "@/lib/api";
import { duration } from "@/lib/motion-tokens";
import { Button } from "@/components/ui/button";
import { AgentCard } from "@/components/fleet/agent-card";
import { SpendChart } from "@/components/fleet/spend-chart";

type FleetState = { fleetRevoked: boolean; agents: Agent[] };
type WsStatus = "connecting" | "live" | "reconnecting";

// Fold a single gateway event into the current fleet state. Live updates are
// applied from the event stream rather than by re-fetching, so the page reflects
// the fleet without polling the gateway on every decision.
function applyEvent(state: FleetState, event: GatewayEvent): FleetState {
  if (event.type === "revocation" && event.scope === "fleet") {
    return {
      fleetRevoked: event.revoked,
      agents: state.agents.map((a) => ({
        ...a,
        revoked: a.revoked_individually || event.revoked,
      })),
    };
  }

  return {
    ...state,
    agents: state.agents.map((a) => {
      if (a.id !== event.agent_id) return a;

      if (event.type === "decision") {
        if (!event.allowed) return a;
        const amount = Number(event.amount);
        if (amount <= 0) return a;
        const spent = Number(a.spent) + amount;
        const cap = a.cap === null ? null : Number(a.cap);
        return {
          ...a,
          spent: spent.toFixed(2),
          remaining: cap === null ? null : (cap - spent).toFixed(2),
        };
      }

      if (event.type === "revocation") {
        return {
          ...a,
          revoked_individually: event.revoked,
          revoked: event.revoked || state.fleetRevoked,
        };
      }

      if (event.type === "cap_change") {
        const cap = Number(event.cap);
        return {
          ...a,
          cap: cap.toFixed(2),
          remaining: (cap - Number(a.spent)).toFixed(2),
        };
      }

      return a;
    }),
  };
}

export default function FleetPage() {
  const [state, setState] = useState<FleetState | null>(null);
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());

  const bannerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const closedByUs = useRef(false);

  const loadSnapshot = useCallback(async () => {
    try {
      const snapshot: FleetResponse = await fetchFleet();
      setState({ fleetRevoked: snapshot.fleet_revoked, agents: snapshot.agents });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load fleet");
    }
  }, []);

  // Connect to the gateway's WebSocket feed and keep it alive across drops. A
  // fresh snapshot is pulled on every (re)connect so any events missed while
  // disconnected are reconciled — this fires on connect, not on a timer.
  useEffect(() => {
    closedByUs.current = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      const socket = new WebSocket(gatewayWsUrl());
      socketRef.current = socket;

      socket.onopen = () => {
        setWsStatus("live");
        void loadSnapshot();
      };
      socket.onmessage = (msg) => {
        try {
          const event: GatewayEvent = JSON.parse(msg.data);
          setState((prev) => (prev ? applyEvent(prev, event) : prev));
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

    void loadSnapshot();
    connect();

    return () => {
      closedByUs.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, [loadSnapshot]);

  // Flash the fleet banner whenever the fleet-wide kill state flips.
  useEffect(() => {
    if (!bannerRef.current || !state) return;
    gsap.fromTo(
      bannerRef.current,
      { backgroundColor: state.fleetRevoked ? "rgba(244,63,94,0.25)" : "rgba(23,195,162,0.20)" },
      { backgroundColor: "rgba(0,0,0,0)", duration: duration.slow, ease: "power2.out" },
    );
  }, [state?.fleetRevoked]);

  const withPending = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setPending((prev) => new Set(prev).add(key));
      try {
        await action();
      } catch (e) {
        setError(e instanceof Error ? e.message : "action failed");
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [],
  );

  if (!state) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">Fleet Overview</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error ? `Gateway unreachable: ${error}` : "Loading fleet…"}
        </p>
      </div>
    );
  }

  const { fleetRevoked, agents } = state;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Fleet Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live agent status and spend, driven by the gateway event feed.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
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
      </div>

      <div
        ref={bannerRef}
        className="flex items-center justify-between rounded-lg border border-slate-800 px-4 py-3"
      >
        <div className="text-sm">
          <span className="text-muted-foreground">Fleet kill switch: </span>
          {fleetRevoked ? (
            <span className="font-medium text-rose-400">ENGAGED — all agents blocked</span>
          ) : (
            <span className="font-medium text-[#17C3A2]">armed — agents operating</span>
          )}
        </div>
        {fleetRevoked ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending.has("fleet")}
            onClick={() => withPending("fleet", restoreFleet)}
          >
            Restore fleet
          </Button>
        ) : (
          <Button
            variant="destructive"
            size="sm"
            disabled={pending.has("fleet")}
            onClick={() => withPending("fleet", revokeFleet)}
          >
            Kill fleet
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-slate-800 p-4">
        <div className="mb-2 text-sm font-medium">Spend vs. budget</div>
        <SpendChart agents={agents} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            fleetRevoked={fleetRevoked}
            busy={pending.has(agent.id)}
            onRevoke={() => withPending(agent.id, () => revokeAgent(agent.id))}
            onRestore={() => withPending(agent.id, () => restoreAgent(agent.id))}
          />
        ))}
      </div>

      {error && (
        <p className="text-xs text-rose-400">Last error: {error}</p>
      )}
    </div>
  );
}
