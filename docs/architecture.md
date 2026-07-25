# AegisAgent — Architecture

This describes what exists in the repo today. Where something is not built yet, it says
so explicitly rather than describing it as if it were working.

## Request flow

```
Agent
  └─> POST /agent-action  (Aegis Gateway)
        1. revocation check   — Redis kill-switch keys
        2. policy check       — OPA, role + action
        3. spend-cap check    — Redis, atomic
        └─> every decision, allow or deny, appended to the Postgres audit ledger
```

Agents never call a banking API directly. Every action goes through the gateway, which is
the single enforcement point. All three checks must pass for an action to be allowed; the
first one that fails short-circuits the rest and returns a `deny_reason`.

The order matters and is deliberate. Revocation is checked first so a killed agent is
stopped without consulting policy at all. The spend cap is checked last, after OPA has
allowed the action, so **a denied action never consumes budget**.

## The three checks

**1. Revocation (Redis).** The gateway checks two keys: `killswitch:fleet` (stops every
agent) and `killswitch:agent:{agent_id}` (stops one). If either exists, the action is
denied with `revoked`. Presence is what matters, not the value.

**2. Policy (OPA).** The gateway POSTs the action to `http://opa:8181/v1/data/aegis/authz`.
`policies/financial_agent.rego` answers one question: is this action permitted for this
agent's role? Roles and their permitted actions live in `policies/data.json`. A role with
no entry, or an action not in its list, is denied with `action_not_permitted`. OPA is
scoped to role/action decisions only — it deliberately does not see budget state, which
lives in Redis where it can be updated atomically per request.

**3. Spend cap (Redis).** Only actions with `amount > 0` consume budget, so a permitted
read-only action never needs a cap configured. The check runs as a Lua script inside Redis
so read-limit-and-increment is a single atomic step; split across two round trips,
concurrent actions could all read the same under-cap total and all be allowed, taking the
agent past its cap. Deny reasons are `cap_exceeded` and `no_cap_configured`.

Caps **fail closed**: an agent with no configured cap has no spending authority. Defaults
are seeded from `aegis-gateway/agents.json` — the registry of which agents exist, their
role, and their default cap — at gateway startup using `SETNX`, so a fresh stack works
immediately without overwriting a cap an operator has already changed.

### Spend is tracked twice, on purpose

Redis holds the running total the cap check reads; the ledger holds the exact
`NUMERIC(20,2)` record of what was actually allowed. These are different number systems:
Redis `INCRBYFLOAT` is binary floating point, the ledger is exact decimal. So rather than
assume they agree, `GET /fleet` reports both and whether they match **to the cent**.

Measured, not assumed: after 1000 transfers of deliberately float-hostile amounts (0.07,
0.29, 1.10, 0.01, 0.03), Redis held `500.0000000000000045` against an exact ledger total
of `500.00` — drift of about 4.5e-15, roughly twelve orders of magnitude below one cent.
Redis accumulates in long double, which is why the drift is far smaller than the ~2.4e-12
a plain double accumulator showed over the same values.

The ledger, not Redis, is the record of truth for what was spent. Redis is the fast
enforcement counter. A reconciliation mismatch is meaningful rather than noise: it means
Redis spend state was reset independently of the ledger, or the two genuinely drifted.

## Audit ledger

Every decision is appended to Postgres — denials included, since a record of what was
blocked is the point of the system. Operator actions go into the *same* chain, so hitting
the kill switch is as tamper-evident as any agent decision: `agent_role` is the actor
(`operator`), `agent_id` is the subject, and `*` means the whole fleet.

Each row stores the hash of the previous row, so
altering any historical row breaks both its own hash and the link every later row depends
on. Schema and the exact hash rule: `ledger/schema.sql`.

Appends take a Postgres advisory lock for the transaction, so concurrent requests append
in one order. Without it, two requests can read the same previous hash and write two rows
claiming the same predecessor, forking the chain.

The audit write is not wrapped in error handling on purpose: if a decision cannot be
recorded, the request fails rather than returning an allow that left no trace.

`ledger/verify_chain.py` recomputes the whole chain and reports tampering. It
reimplements the hash rule from the schema rather than importing the gateway's code — a
verifier sharing code with the writer only proves the writer is self-consistent. It reads
only stored columns, so it also works against a database dump or a replica.

## Live event feed

`GET /ws` (WebSocket) streams every decision and every revocation as it happens, so the
console reflects a kill switch immediately rather than inferring it from the next action.

Events do not go straight from the request handler to the socket. The handler only knows
about clients connected to *its own* process, so behind a load balancer with more than one
gateway replica, a console attached to replica A would silently miss everything handled by
replica B. Instead the handler publishes to a Redis channel and every replica relays that
channel to its own clients, so any replica can serve any console.

Verified by publishing an event straight into Redis from an unrelated process and watching
it arrive at a connected client — the path really is via Redis, not in-process.

One Redis subscription serves all connected clients rather than one per connection; three
clients connecting and disconnecting leaves `PUBSUB NUMSUB aegis:events` at 1.

Events are published *after* the ledger write, so the feed never announces a decision that
is not yet durably recorded, and each event carries the `ledger_id` and `hash` of the row
it corresponds to.

```
  6.6s  #125  decision   rogue-001  exfiltrate_funds  5000.00  allow=False action_not_permitted
  6.7s  #126  REVOCATION scope=agent subject=hft-001 revoked=True
  6.8s  #127  decision   hft-001    transfer            25.00  allow=False revoked
```

## The agent fleet

`agents/fleet.py` runs three simulated agents concurrently, all routed through the
gateway. Behaviour is deterministic for a given `--seed` so a demo run can be repeated.

| Agent | Role | Behaviour | What it demonstrates |
|---|---|---|---|
| `wealth-001` | `wealth_advisory` | reads balances, occasional modest transfer | that the policy actually permits legitimate work |
| `hft-001` | `hft` | small transfers every 0.4s | the spend cap stopping a *permitted* agent once its budget is gone |
| `rogue-001` | `rogue` | escalating attempts, incl. an action not in the vocabulary | policy refusing everything, regardless of amount |

The HFT agent matters because nothing about it misbehaves — every action it takes is
permitted by policy, and it still gets cut off. Policy and budget are separate controls.
Its `query_balance` calls keep succeeding after its transfers are refused, since a spent
budget should not block a read.

**A revoked agent does not stop asking.** It keeps issuing the same actions and the gateway
keeps refusing them. Governance that relied on the agent choosing to stand down would be
worthless against a compromised or malfunctioning agent, so enforcement lives at the
chokepoint rather than in the agent's own good behaviour. A mid-run fleet kill is visible
as every agent flipping to `revoked` and back without any of them pausing.

```
  3.6s  hft-001     transfer      10.00  ALLOW
  4.0s  hft-001     transfer      20.00  DENY   revoked     <- operator hits kill switch
  4.1s  rogue-001   transfer   25000.00  DENY   revoked
  4.4s  wealth-001  transfer     100.00  DENY   revoked
  ...
  9.1s  hft-001     query_balance  0.00  ALLOW              <- operator restores
```

## Services

- **Aegis Gateway** (`aegis-gateway/`) — FastAPI. Runs the three checks, writes the ledger,
  and exposes the operator surface. Endpoints: `GET /health`, `POST /agent-action`,
  `POST /revoke`, `POST /restore`, `POST /agents/{id}/cap`, `GET /fleet`, `GET /audit`,
  `GET /ws` (WebSocket). The three mutating endpoints require the operator key.
- **OPA** (`policies/`) — policy engine, evaluates role/action rules. Policies are mounted
  read-only from `policies/`.
- **Redis** — kill-switch flags and spend state (`cap:agent:{id}`, `spent:agent:{id}`).
- **Postgres** (`ledger/`) — the hash-chained audit ledger. Schema is applied on first
  init of an empty data directory.

All four run via `infra/docker-compose.yml`.

## Operator control

Three endpoints change what the system will allow: `/revoke` and `/restore` (kill or
reinstate an agent or the whole fleet) and `/agents/{id}/cap` (set a spend cap). All three
require a shared secret in the `X-Aegis-Operator-Key` header; without it, or with the wrong
value, the request is a 401. It is deliberately one shared key rather than a user/session
system — one console, one gateway — read from `AEGIS_OPERATOR_KEY`. If that variable is
unset the gateway fails closed, returning 503 on every operator endpoint: an unconfigured
key means nobody may change the rules, not everybody.

Every operator action is appended to the same hash chain as agent decisions, so changing a
cap is as tamper-evident as blocking a transfer. An operator who could quietly raise a
limit would leave the ledger telling a misleading story about why a later transfer was
allowed. A `cap_change` records the new cap in `amount` and the previous cap in `detail`
(`prev_cap=…`), so the chain shows the whole move, not just where it landed.

## Not built yet

Listed so this document is not read as claiming more than exists:

- **Console wiring.** The gateway exposes everything the console needs (`/fleet`, `/audit`,
  `/ws`, `/revoke`), but `operator-console/` does not call any of it yet.
- **Agent reasoning is not wired into gateway requests.** `agents/groq_agent.py` can produce
  real LLM reasoning, but `POST /agent-action` has no field to carry a rationale, so the
  fleet's actions are scripted rather than model-chosen. Adding a rationale to the request
  and the ledger would close this.
- **Operator console behaviour.** `operator-console/` is a Next.js shell with placeholder
  pages for fleet, policy, and audit. It does not talk to the gateway.
- **Banking API forwarding.** An allowed action returns `{"allow": true}`. The gateway does
  not yet forward anything downstream.
- **Agent identity.** `/agent-action` is unauthenticated; any caller can claim any agent id
  and role. The *operator* endpoints are now key-protected (see below), but agent-side
  identity is not: a real deployment would bind it to a credential rather than trust the
  request body. This is the remaining demo-scoped auth gap.

## On the NEAR AI / TEE claim

Stated precisely, because it is easy to overclaim: NEAR AI Cloud's TEE attestation is real
and independently verifiable **for LLM inference calls**. The agent's own orchestration
process running inside a TEE is *not* a documented NEAR AI product. So an agent's model
calls can be attested; the agent's runtime, memory, and tool calls are not.

`agents/mock_attested_agent.py` hits the real attestation endpoint when `live=True`, and
`agents/groq_agent.py` runs the actual agent reasoning on Groq — deliberately decoupled
from the attestation claim. Evidence and sources: `docs/near-ai-findings.md`.
