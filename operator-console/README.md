# operator-console

The AegisAgent operator console — a Next.js app for watching the agent fleet and
driving the kill switch. Built with shadcn/ui (Base UI primitives), Recharts, and
GSAP on Next.js 16 + Tailwind v4.

## Running it

The console talks to the Aegis Gateway, so bring the stack up first (from the repo
root):

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

Then, in `operator-console/`:

```bash
npm install
npm run dev
```

Open http://localhost:3000/fleet.

## How it talks to the gateway

Mutations never leave the browser carrying the operator key. Instead:

- **Reads and mutations** go to same-origin Next.js **route handlers** under `/api`
  (`/api/fleet`, `/api/revoke`, `/api/restore`). Those run server-side, forward to
  the gateway, and attach the `X-Aegis-Operator-Key` header there. The shared secret
  stays on the server and is never included in the client bundle.
- **The live feed** is the one thing the browser opens directly: the gateway's
  `/ws` WebSocket, which is unauthenticated and send-only, so no secret is exposed.

The Fleet page loads one snapshot from `/api/fleet`, then applies gateway events
from the WebSocket — it does **not** poll the gateway on every decision. A fresh
snapshot is pulled on each (re)connect to reconcile anything missed while dropped.

## Configuration

All three have sensible dev defaults, so a fresh clone runs against the local stack
with no `.env` needed. Override in `operator-console/.env.local` for other setups:

| Variable | Used by | Default | Secret? |
| --- | --- | --- | --- |
| `GATEWAY_URL` | route handlers (server) | `http://localhost:8001` | no |
| `AEGIS_OPERATOR_KEY` | route handlers (server) | `aegis_dev_operator_key` | **yes** — server-only, never `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_GATEWAY_WS_URL` | browser | `ws://localhost:8001/ws` | no |

`AEGIS_OPERATOR_KEY` is intentionally **not** prefixed `NEXT_PUBLIC_`; that prefix is
what would place it in the client bundle, which is exactly what the proxy avoids.
