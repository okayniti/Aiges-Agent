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
