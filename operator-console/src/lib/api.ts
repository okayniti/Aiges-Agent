// Browser-side gateway client.
//
// Reads (fleet snapshot) and mutations (revoke/restore) go to same-origin Next
// route handlers under /api, which forward to the gateway server-side and attach
// the operator key. The one thing the browser talks to directly is the gateway's
// WebSocket feed, which is unauthenticated and send-only, so no secret is exposed.

export type SpendReconciliation = {
  redis: string;
  ledger: string;
  agrees_to_the_cent: boolean;
};

export type Agent = {
  id: string;
  role: string;
  cap: string | null;
  spent: string;
  remaining: string | null;
  revoked: boolean;
  revoked_individually: boolean;
  spend_reconciliation: SpendReconciliation;
};

export type FleetResponse = {
  fleet_revoked: boolean;
  agents: Agent[];
};

export type DecisionEvent = {
  type: "decision";
  ts: string;
  ledger_id: number;
  hash: string;
  agent_id: string;
  agent_role: string;
  action: string;
  amount: string;
  allowed: boolean;
  deny_reason: string | null;
};

export type RevocationEvent = {
  type: "revocation";
  ts: string;
  ledger_id: number;
  hash: string;
  scope: "agent" | "fleet";
  agent_id: string | null;
  subject: string;
  revoked: boolean;
};

export type CapChangeEvent = {
  type: "cap_change";
  ts: string;
  ledger_id: number;
  hash: string;
  agent_id: string;
  previous_cap: string | null;
  cap: string;
};

export type GatewayEvent = DecisionEvent | RevocationEvent | CapChangeEvent;

export function gatewayWsUrl(): string {
  return process.env.NEXT_PUBLIC_GATEWAY_WS_URL ?? "ws://localhost:8001/ws";
}

// --- Audit ledger ---

export type ChainStatus = {
  intact: boolean;
  rows: number;
  broken_at: number | null;
  head: string | null;
};

export type AuditEntry = {
  id: number;
  ts: string;
  agent_id: string;
  agent_role: string;
  action: string;
  amount: string;
  allowed: boolean;
  deny_reason: string | null;
  detail: string | null;
  hash: string;
  prev_hash: string;
};

export type AuditResponse = { chain: ChainStatus; entries: AuditEntry[] };

export async function fetchAudit(limit = 100): Promise<AuditResponse> {
  const res = await fetch(`/api/audit?limit=${limit}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`audit request failed: ${res.status}`);
  return res.json();
}

// A ledger row as it appears in the live feed, whether it arrived in the initial
// /audit snapshot or as a WebSocket event. Mapping both to one shape lets the feed
// render a single, deduplicated, newest-first list.
export type FeedRow = {
  id: number;
  ts: string;
  agent_id: string;
  agent_role: string;
  action: string;
  amount: string | null;
  allowed: boolean;
  deny_reason: string | null;
  detail: string | null;
  hash: string;
};

export function entryToFeedRow(e: AuditEntry): FeedRow {
  return {
    id: e.id,
    ts: e.ts,
    agent_id: e.agent_id,
    agent_role: e.agent_role,
    action: e.action,
    amount: e.amount,
    allowed: e.allowed,
    deny_reason: e.deny_reason,
    detail: e.detail,
    hash: e.hash,
  };
}

// A gateway event carries the ledger_id and hash of the row it wrote, so the feed
// can present operator actions and decisions the same way the ledger stores them.
export function eventToFeedRow(ev: GatewayEvent): FeedRow {
  const base = { id: ev.ledger_id, ts: ev.ts, hash: ev.hash };
  if (ev.type === "decision") {
    return {
      ...base,
      agent_id: ev.agent_id,
      agent_role: ev.agent_role,
      action: ev.action,
      amount: ev.amount,
      allowed: ev.allowed,
      deny_reason: ev.deny_reason,
      detail: null,
    };
  }
  if (ev.type === "revocation") {
    return {
      ...base,
      agent_id: ev.subject,
      agent_role: "operator",
      action: ev.revoked ? "revoke" : "restore",
      amount: null,
      allowed: true,
      deny_reason: null,
      detail: ev.scope === "fleet" ? "scope=fleet" : null,
    };
  }
  return {
    ...base,
    agent_id: ev.agent_id,
    agent_role: "operator",
    action: "cap_change",
    amount: ev.cap,
    allowed: true,
    deny_reason: null,
    detail: ev.previous_cap === null ? null : `prev_cap=${ev.previous_cap}`,
  };
}

export async function fetchFleet(): Promise<FleetResponse> {
  const res = await fetch("/api/fleet", { cache: "no-store" });
  if (!res.ok) throw new Error(`fleet request failed: ${res.status}`);
  return res.json();
}

type RevokeBody = { scope: "agent" | "fleet"; agent_id?: string };

async function mutate(path: string, body: RevokeBody): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${path} failed: ${res.status} ${detail}`);
  }
}

export function revokeAgent(agentId: string) {
  return mutate("/api/revoke", { scope: "agent", agent_id: agentId });
}
export function restoreAgent(agentId: string) {
  return mutate("/api/restore", { scope: "agent", agent_id: agentId });
}
export function revokeFleet() {
  return mutate("/api/revoke", { scope: "fleet" });
}
export function restoreFleet() {
  return mutate("/api/restore", { scope: "fleet" });
}
