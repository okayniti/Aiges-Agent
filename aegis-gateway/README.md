# aegis-gateway

The FastAPI service that acts as the mandatory proxy every autonomous agent action must
pass through before it can reach a real banking API. It is the single enforcement point
where policy checks and budget checks happen, so no action can bypass governance.

## Endpoints

- `GET /health` — liveness.
- `POST /agent-action` — runs the three checks in order (revocation, OPA policy, spend
  cap) and appends the decision to the audit ledger.
- `POST /revoke` / `POST /restore` *(operator key)* — kill or reinstate one agent or the
  whole fleet. Body is `{"scope":"fleet"}` or `{"scope":"agent","agent_id":"wealth-001"}`;
  `scope=agent` without an `agent_id` is a 400. Both are recorded in the audit chain.
- `POST /agents/{agent_id}/cap` *(operator key)* — set an agent's spend cap. Body is
  `{"cap": 250}` (must be > 0). Recorded in the audit chain as a `cap_change`, with the new
  cap in the `amount` column and the previous cap in `detail` (`prev_cap=…`), so the ledger
  shows the whole move. Only the cap changes; spend is left as-is. Unknown agent is a 404.
- `GET /fleet` — every registered agent's role, cap, spend, remaining, and revoked state,
  plus the Redis-vs-ledger spend reconciliation.
- `GET /policy` — what the gateway enforces: role→action permissions read live from OPA's
  `data.permissions`, plus each agent's role and current cap. A read, no key required.
- `GET /audit?limit=50` — recent ledger entries newest-first, plus chain integrity.
- `GET /ws` — WebSocket. Streams every decision, revocation, and cap change as it happens,
  each event carrying the `ledger_id` and `hash` of the row it corresponds to. Send-only;
  the gateway ignores anything a client sends.

## Operator authentication

The mutating endpoints — `/revoke`, `/restore`, `/agents/{id}/cap` — require a shared
operator key in the `X-Aegis-Operator-Key` header. A request without it, or with the wrong
value, gets a 401. This is deliberately a single shared secret, not a user or session
system: one operator console talks to one gateway, and accounts would add surface without
adding safety. `GET` endpoints and `/agent-action` are unauthenticated.

The key is read from the `AEGIS_OPERATOR_KEY` environment variable (an env var, not a
config file, so it is not committed and is trivial to override per deployment).
`infra/docker-compose.yml` falls back to a dev default so a fresh clone runs; set it in
`.env` for anything shared. If the variable is unset the gateway **fails closed** — every
operator endpoint returns 503 rather than running unauthenticated.

```bash
curl -X POST http://localhost:8001/agents/hft-001/cap \
  -H 'Content-Type: application/json' \
  -H 'X-Aegis-Operator-Key: aegis_dev_operator_key' \
  -d '{"cap": 250}'
```

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

## Configuration

All backing services are overridable by environment variable, so the same image runs
against `infra/docker-compose.yml` locally or against managed services in the cloud
without a rebuild.

| Variable | Default (docker-compose) | Points to |
| --- | --- | --- |
| `AEGIS_OPERATOR_KEY` | *(unset — fails closed)* | shared operator secret, see above |
| `OPA_URL` | `http://opa:8181` | OPA server (no trailing slash) |
| `REDIS_URL` | `redis://redis:6379` | Redis — use `rediss://` for a TLS endpoint (e.g. Upstash) |
| `POSTGRES_DSN` | `postgresql://postgres:aegis_dev_password@postgres:5432/aegis` | Postgres ledger — a managed provider's connection string works as-is |
