# AegisAgent — Architecture (Day 1)

This describes only what exists in the repo today. It is not a spec for unbuilt
functionality — policy rules, budget logic, and the actual proxying behavior have not
been implemented yet.

## Intended request flow

Agent → Aegis Gateway → OPA policy check + Redis budget check → Banking API or Blocked

An autonomous agent would send its intended action to the Aegis Gateway. The gateway
would ask OPA whether the action is allowed under the current policy, and check Redis for
whether the action stays within budget. If both checks pass, the gateway would forward the
action to the real banking API; if either check fails, the gateway would block it instead.

**Today, none of this decision logic exists.** The gateway currently only exposes a
`GET /health` endpoint. The policy check, budget check, and forwarding/blocking behavior
described above are the plan for later in the sprint, not current behavior.

## Services

- **Aegis Gateway** (`aegis-gateway/`) — the FastAPI service every agent action is meant to
  pass through; today it only reports its own health.
- **OPA** (`policies/`, run via `infra/docker-compose.yml`) — the policy engine that will
  evaluate agent actions against Rego rules; no policies are written yet.
- **Redis** (run via `infra/docker-compose.yml`) — will hold budget/spend-tracking state
  for the kill-switch checks; nothing writes to it yet.
- **Postgres** (`ledger/`, run via `infra/docker-compose.yml`) — will store the audit log
  of every agent action and its outcome; no schema exists yet.
