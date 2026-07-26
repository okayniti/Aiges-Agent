"use client";

// Single source of live gateway state for the whole console.
//
// The console used to be three routes, each opening its own WebSocket and its own
// snapshot fetches. On one continuous page that would mean three sockets and three
// copies of the fleet, which can disagree with each other mid-demo. This provider
// owns exactly one socket and one copy of each piece of state; every panel reads
// from here.
//
// The data contract is unchanged from the previous per-page implementations: same
// endpoints, same event folding, same dedupe-and-cap on the feed. This is a
// wiring change, not a behaviour change.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  entryToFeedRow,
  eventToFeedRow,
  fetchAudit,
  fetchFleet,
  fetchPolicy,
  gatewayWsUrl,
  restoreAgent,
  restoreFleet,
  revokeAgent,
  revokeFleet,
  setAgentCap,
  type Agent,
  type ChainStatus,
  type FeedRow,
  type GatewayEvent,
  type PolicyResponse,
} from "@/lib/api";

export type WsStatus = "connecting" | "live" | "reconnecting";

// One timed gateway round-trip, measured entirely in the browser.
export type LatencySample = { label: string; ms: number; at: number };

type FleetState = { fleetRevoked: boolean; agents: Agent[] };

const MAX_ROWS = 250;
const MAX_SAMPLES = 60;

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

// Merge a row into the feed, newest first, de-duplicated by ledger id, capped so
// the DOM stays light during a long demo.
function mergeRow(rows: FeedRow[], row: FeedRow): FeedRow[] {
  if (rows.some((r) => r.id === row.id)) return rows;
  return [row, ...rows].slice(0, MAX_ROWS);
}

type Store = {
  fleet: FleetState | null;
  rows: FeedRow[];
  chain: ChainStatus | null;
  policy: PolicyResponse | null;
  wsStatus: WsStatus;
  latency: LatencySample[];
  sinceVerify: number;
  verifying: boolean;
  error: string | null;
  pending: Set<string>;
  freshIds: React.RefObject<Set<number>>;
  verify: () => Promise<void>;
  killFleet: () => void;
  reviveFleet: () => void;
  killAgent: (id: string) => void;
  reviveAgent: (id: string) => void;
  saveCap: (id: string, cap: number) => Promise<string>;
};

const GatewayContext = createContext<Store | null>(null);

export function useGateway(): Store {
  const store = useContext(GatewayContext);
  if (!store) throw new Error("useGateway must be used inside <GatewayProvider>");
  return store;
}

export function GatewayProvider({ children }: { children: React.ReactNode }) {
  const [fleet, setFleet] = useState<FleetState | null>(null);
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [chain, setChain] = useState<ChainStatus | null>(null);
  const [policy, setPolicy] = useState<PolicyResponse | null>(null);
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const [latency, setLatency] = useState<LatencySample[]>([]);
  const [sinceVerify, setSinceVerify] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());

  // Rows that arrived live over the socket, so the feed can animate those and
  // leave snapshot rows still.
  const freshIds = useRef<Set<number>>(new Set());
  const closedByUs = useRef(false);

  // Time a gateway round-trip with the browser's own clock on both ends, so the
  // number never depends on the gateway and the host agreeing about the time.
  const timed = useCallback(async <T,>(label: string, run: () => Promise<T>): Promise<T> => {
    const started = performance.now();
    try {
      return await run();
    } finally {
      const ms = performance.now() - started;
      setLatency((prev) => [{ label, ms, at: Date.now() }, ...prev].slice(0, MAX_SAMPLES));
    }
  }, []);

  const loadFleet = useCallback(async () => {
    try {
      const snapshot = await timed("GET /fleet", fetchFleet);
      setFleet({ fleetRevoked: snapshot.fleet_revoked, agents: snapshot.agents });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load fleet");
    }
  }, [timed]);

  const loadPolicy = useCallback(async () => {
    try {
      setPolicy(await timed("GET /policy", fetchPolicy));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load policy");
    }
  }, [timed]);

  const verify = useCallback(async () => {
    setVerifying(true);
    try {
      const snapshot = await timed("GET /audit", () => fetchAudit(100));
      setChain(snapshot.chain);
      setSinceVerify(0);
      setRows((prev) => {
        let next = prev;
        // snapshot.entries arrives newest-first and mergeRow prepends, so folding
        // in that order would leave the list oldest-first. Iterate oldest-to-newest
        // so the newest entry is prepended last and lands on top.
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
  }, [timed]);

  // One socket for the whole page, kept alive across drops. A fresh snapshot is
  // pulled on every (re)connect so events missed while disconnected are
  // reconciled — on connect, not on a timer.
  useEffect(() => {
    closedByUs.current = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | undefined;

    function connect() {
      socket = new WebSocket(gatewayWsUrl());

      socket.onopen = () => {
        setWsStatus("live");
        // Everything the page needs is (re)loaded here rather than on mount, so
        // a reconnect reconciles whatever was missed while the socket was down —
        // and so the loads are driven by the socket coming up rather than by a
        // timer or a render.
        void loadFleet();
        void loadPolicy();
        void verify();
      };
      socket.onmessage = (msg) => {
        try {
          const event: GatewayEvent = JSON.parse(msg.data);
          const row = eventToFeedRow(event);
          freshIds.current.add(row.id);
          setFleet((prev) => (prev ? applyEvent(prev, event) : prev));
          setRows((prev) => {
            if (prev.some((r) => r.id === row.id)) return prev;
            setSinceVerify((n) => n + 1);
            return mergeRow(prev, row);
          });
          // A cap change moves what the policy panel shows, so refresh it rather
          // than letting the two views drift.
          if (event.type === "cap_change") void loadPolicy();
        } catch {
          // ignore malformed frames
        }
      };
      socket.onclose = () => {
        if (closedByUs.current) return;
        setWsStatus("reconnecting");
        // Try a read anyway. If the gateway is unreachable this is what surfaces
        // "Gateway unreachable" in the panels instead of leaving them saying
        // "Loading…" forever, since onopen may never fire.
        void loadFleet();
        reconnectTimer = setTimeout(connect, 2000);
      };
      socket.onerror = () => socket?.close();
    }

    connect();

    return () => {
      closedByUs.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [loadFleet, loadPolicy, verify]);

  const withPending = useCallback(
    (key: string, action: () => Promise<unknown>) => {
      setPending((prev) => new Set(prev).add(key));
      void (async () => {
        try {
          await timed(key, action);
        } catch (e) {
          setError(e instanceof Error ? e.message : "action failed");
        } finally {
          setPending((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      })();
    },
    [timed],
  );

  const killFleet = useCallback(
    () => withPending("POST /revoke fleet", revokeFleet),
    [withPending],
  );
  const reviveFleet = useCallback(
    () => withPending("POST /restore fleet", restoreFleet),
    [withPending],
  );
  const killAgent = useCallback(
    (id: string) => withPending(`POST /revoke ${id}`, () => revokeAgent(id)),
    [withPending],
  );
  const reviveAgent = useCallback(
    (id: string) => withPending(`POST /restore ${id}`, () => restoreAgent(id)),
    [withPending],
  );

  const saveCap = useCallback(
    async (id: string, cap: number) => {
      const result = await timed(`POST /agents/${id}/cap`, () => setAgentCap(id, cap));
      // The gateway also publishes a cap_change event, which the socket handler
      // folds in. Applying it here too keeps the input responsive if the event
      // is slower than the response.
      setFleet((prev) =>
        prev
          ? {
              ...prev,
              agents: prev.agents.map((a) =>
                a.id === id
                  ? {
                      ...a,
                      cap: result.cap,
                      remaining: (Number(result.cap) - Number(a.spent)).toFixed(2),
                    }
                  : a,
              ),
            }
          : prev,
      );
      setPolicy((prev) =>
        prev
          ? {
              ...prev,
              agents: prev.agents.map((a) =>
                a.id === id ? { ...a, cap: result.cap } : a,
              ),
            }
          : prev,
      );
      return result.cap;
    },
    [timed],
  );

  const value = useMemo<Store>(
    () => ({
      fleet,
      rows,
      chain,
      policy,
      wsStatus,
      latency,
      sinceVerify,
      verifying,
      error,
      pending,
      freshIds,
      verify,
      killFleet,
      reviveFleet,
      killAgent,
      reviveAgent,
      saveCap,
    }),
    [
      fleet,
      rows,
      chain,
      policy,
      wsStatus,
      latency,
      sinceVerify,
      verifying,
      error,
      pending,
      verify,
      killFleet,
      reviveFleet,
      killAgent,
      reviveAgent,
      saveCap,
    ],
  );

  return <GatewayContext.Provider value={value}>{children}</GatewayContext.Provider>;
}
