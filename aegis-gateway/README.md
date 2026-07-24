# aegis-gateway

The FastAPI service that acts as the mandatory proxy every autonomous agent action must
pass through before it can reach a real banking API. It is the single enforcement point
where policy checks and budget checks happen, so no action can bypass governance.

## Endpoints

- `GET /health` — liveness.
- `POST /agent-action` — runs the three checks in order (revocation, OPA policy, spend
  cap) and appends the decision to the audit ledger.
- `POST /revoke` / `POST /restore` — kill or reinstate one agent or the whole fleet.
  Body is `{"scope":"fleet"}` or `{"scope":"agent","agent_id":"wealth-001"}`; `scope=agent`
  without an `agent_id` is a 400. Both are recorded in the audit chain.
- `GET /fleet` — every registered agent's role, cap, spend, remaining, and revoked state,
  plus the Redis-vs-ledger spend reconciliation.
- `GET /audit?limit=50` — recent ledger entries newest-first, plus chain integrity.
- `GET /ws` — WebSocket. Streams every decision and revocation as it happens, each event
  carrying the `ledger_id` and `hash` of the row it corresponds to. Send-only; the gateway
  ignores anything a client sends.

```bash
curl -X POST http://localhost:8001/agent-action \
  -H 'Content-Type: application/json' \
  -d '{"agent":{"id":"wealth-001","role":"wealth_advisory"},"action":"transfer","amount":300}'
```

Allowed actions return `{"allow": true}`. Denials return `{"allow": false}` plus a
`deny_reason`: `revoked`, `action_not_permitted`, `cap_exceeded`, or `no_cap_configured`.

`agents.json` is the agent registry — which agents exist, their role, and their default
spend cap. Caps are seeded into Redis at startup with `SETNX` so an operator's live edits
survive a restart.

`GET /fleet` reports spend from both Redis and the ledger because they use different number
systems (binary float vs exact decimal) and reconciling them is cheap. The ledger is the
record of truth; Redis is the fast enforcement counter. See `docs/architecture.md` for the
measured drift.

An allowed action does not yet get forwarded to a downstream banking API. See
`docs/architecture.md` for the full flow and what is still unbuilt.
