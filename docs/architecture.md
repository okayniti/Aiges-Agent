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

## Services

- **Aegis Gateway** (`aegis-gateway/`) — FastAPI. Runs the three checks, writes the ledger,
  and exposes the operator surface. Endpoints: `GET /health`, `POST /agent-action`,
  `POST /revoke`, `POST /restore`, `GET /fleet`, `GET /audit`.
- **OPA** (`policies/`) — policy engine, evaluates role/action rules. Policies are mounted
  read-only from `policies/`.
- **Redis** — kill-switch flags and spend state (`cap:agent:{id}`, `spent:agent:{id}`).
- **Postgres** (`ledger/`) — the hash-chained audit ledger. Schema is applied on first
  init of an empty data directory.

All four run via `infra/docker-compose.yml`.

## Not built yet

Listed so this document is not read as claiming more than exists:

- **WebSocket / Redis Pub/Sub push.** Revocation works by setting a Redis key, and the
  gateway reads it on the next action. There is no live push channel to the console yet.
- **The agent fleet.** `agents/` holds `mock_attested_agent.py` and `groq_agent.py`. The
  three personas — Wealth Advisory, HFT, Rogue — exist as roles in policy, not as running
  agents.
- **Operator console behaviour.** `operator-console/` is a Next.js shell with placeholder
  pages for fleet, policy, and audit. It does not talk to the gateway.
- **Banking API forwarding.** An allowed action returns `{"allow": true}`. The gateway does
  not yet forward anything downstream.
- **Authentication.** `/agent-action` is unauthenticated; any caller can claim any agent
  id and role. This is a demo-scoped gap, and a real deployment would need agent identity
  bound to a credential rather than asserted in the request body.

## On the NEAR AI / TEE claim

Stated precisely, because it is easy to overclaim: NEAR AI Cloud's TEE attestation is real
and independently verifiable **for LLM inference calls**. The agent's own orchestration
process running inside a TEE is *not* a documented NEAR AI product. So an agent's model
calls can be attested; the agent's runtime, memory, and tool calls are not.

`agents/mock_attested_agent.py` hits the real attestation endpoint when `live=True`, and
`agents/groq_agent.py` runs the actual agent reasoning on Groq — deliberately decoupled
from the attestation claim. Evidence and sources: `docs/near-ai-findings.md`.
