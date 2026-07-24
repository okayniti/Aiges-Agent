# aegis-gateway

The FastAPI service that acts as the mandatory proxy every autonomous agent action must
pass through before it can reach a real banking API. It is the single enforcement point
where policy checks and budget checks happen, so no action can bypass governance.

## Endpoints

- `GET /health` — liveness.
- `POST /agent-action` — runs the three checks in order (revocation, OPA policy, spend
  cap) and appends the decision to the audit ledger.

```bash
curl -X POST http://localhost:8001/agent-action \
  -H 'Content-Type: application/json' \
  -d '{"agent":{"id":"wealth-001","role":"wealth_advisory"},"action":"transfer","amount":300}'
```

Allowed actions return `{"allow": true}`. Denials return `{"allow": false}` plus a
`deny_reason`: `revoked`, `action_not_permitted`, `cap_exceeded`, or `no_cap_configured`.

`caps.json` holds the default per-agent spend caps, seeded into Redis at startup with
`SETNX` so an operator's live edits survive a restart.

An allowed action does not yet get forwarded to a downstream banking API. See
`docs/architecture.md` for the full flow and what is still unbuilt.
