# Deploying AegisAgent for free

A guide to putting the real stack — not a static demo — on the public internet at
zero cost, using free tiers that were re-checked while writing this (July 2026), not
assumed from memory. Where a free tier has a real limitation (cold starts, pausing),
it's stated here rather than discovered later.

## What runs where

| Piece | Free host | Why this one |
|---|---|---|
| Operator console (Next.js) | **Vercel** (Hobby) | Built for Next.js specifically; 1M function calls/month, no card, no expiry |
| Gateway + OPA (bundled) | **Koyeb** | One of the few free tiers that supports **WebSockets** — required for the live feed — without a paid upgrade |
| Spend/kill-switch state | **Upstash** (Redis) | No-card free tier, 500K commands/month, no time limit |
| Audit ledger | **Supabase** (Postgres) | No-card free tier, data persists indefinitely (pauses after inactivity, doesn't delete) |

This split matters because most "free web service" tiers (Render, Fly.io's trial)
either don't support long-lived WebSocket connections on their free plan or don't
have a free plan at all anymore — and the live decision feed is core to what this
project demonstrates, so a host that silently drops it wasn't an option. Koyeb was
checked specifically for this and documents WebSocket support on its free instance.

Nothing about the app's own code assumes a particular host — `aegis-gateway/main.py`
already reads `OPA_URL`, `REDIS_URL`, and `POSTGRES_DSN` from the environment (falling
back to the local docker-compose hostnames when unset), and `agents/fleet.py` already
reads `AEGIS_GATEWAY_URL`. The only new file is `infra/deploy/`, which packages OPA
*into* the gateway's own container — see below.

## Why a separate Dockerfile for deployment

Locally, `infra/docker-compose.yml` runs OPA as its own container. Free-tier hosts
typically give you **one** web service, not a 4-container compose stack, and running
OPA as a second free service would cost a second cold-start-prone slot for no reason —
it's a small process that adds no value being physically separate on a single-replica
deploy.

`infra/deploy/Dockerfile` builds one image containing both: it copies the `opa` binary
out of the official OPA image, bundles `policies/` into the image, and
`infra/deploy/start.sh` launches OPA on `127.0.0.1:8181` first, waits for it to answer
its own health check, then execs `uvicorn`. This was built and smoke-tested locally
before writing these instructions — `docker build -f infra/deploy/Dockerfile .` from
the repo root, run against real Redis/Postgres, `/agent-action` correctly allowed a
`wealth_advisory` transfer and denied a `rogue` one with `action_not_permitted`, and
`/policy` round-tripped live data from the embedded OPA — so this is a verified path,
not a guess.

Local `docker compose up` is completely unaffected; that still uses
`aegis-gateway/Dockerfile` with OPA as its own container, exactly as before.

## Step 1 — Postgres (Supabase)

1. [supabase.com](https://supabase.com) → sign up (no card) → **New project**.
   Save the database password you're given — you'll need it in the connection string.
2. Once it's provisioned: **Project Settings → Database → Connection string** → copy
   the **URI** (session pooler is fine for a single gateway instance). It looks like:
   ```
   postgresql://postgres.xxxxxxxx:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
3. Apply the schema: **SQL Editor** → paste the full contents of
   [`ledger/schema.sql`](../ledger/schema.sql) → **Run**. This creates the
   hash-chained `audit_log` table the gateway writes to.
4. Keep the connection string — it's `POSTGRES_DSN` in Step 3. Add `?sslmode=require`
   to the end if Supabase doesn't already include it.

*Free-tier note: the project pauses after 7 days with no database request. Data isn't
deleted, just paused — resume it manually from the Supabase dashboard, or let the
gateway's own traffic keep it awake.*

## Step 2 — Redis (Upstash)

1. [upstash.com](https://upstash.com) → sign up (no card) → **Create Database** →
   Redis, any region close to where Koyeb will run.
2. On the database page, copy the **`rediss://` connection string** (note the extra
   `s` — this is the TLS endpoint; `redis-py`, which the gateway uses, accepts this
   scheme directly with no extra config).
3. Keep it — it's `REDIS_URL` in Step 3.

## Step 3 — Gateway + OPA (Koyeb)

1. [koyeb.com](https://koyeb.com) → sign up (no card, unless they can't otherwise
   verify you're human) → **Create Web Service** → **GitHub** → authorize and pick
   this repo.
2. Build method: **Dockerfile**.
   - **Dockerfile path**: `infra/deploy/Dockerfile`
   - **Build context / work directory**: repo root (leave it unset rather than
     pointing it at `aegis-gateway/` — the Dockerfile needs to see both
     `aegis-gateway/` and `policies/`, so a root context is required).
3. Instance size: the free instance (0.1 vCPU / 512 MB) is enough — the gateway and
   OPA are both light processes.
4. Environment variables:
   | Key | Value |
   |---|---|
   | `AEGIS_OPERATOR_KEY` | pick a real secret — this guards `/revoke`, `/restore`, and cap changes |
   | `REDIS_URL` | the `rediss://...` string from Step 2 |
   | `POSTGRES_DSN` | the connection string from Step 1 |

   (`OPA_URL` is already baked into the image as `http://127.0.0.1:8181` — don't set it.)
5. Deploy. Koyeb gives you a public HTTPS URL like `https://<name>-<org>.koyeb.app`.
6. Confirm it's actually enforcing policy, not just alive:
   ```bash
   curl https://<your-app>.koyeb.app/health
   curl -X POST https://<your-app>.koyeb.app/agent-action \
     -H 'Content-Type: application/json' \
     -d '{"agent":{"id":"rogue-001","role":"rogue"},"action":"transfer","amount":50}'
   # expect: {"allow":false,"deny_reason":"action_not_permitted"}
   ```

*Free-tier note: the instance scales to zero after 1 hour with no traffic. The next
request wakes it with a cold start (a few seconds) and drops any open WebSocket
connections — the console will reconnect on its own, but the very first load after an
idle period may take a moment longer than usual. There's no way to disable this on the
free instance; a paid instance removes it if this becomes a real problem for judging.*

## Step 4 — Operator console (Vercel)

1. [vercel.com](https://vercel.com) → sign up (no card) → **Add New → Project** →
   import this repo.
2. **Root Directory**: `operator-console` (this is a monorepo — Vercel needs to be
   told the Next.js app isn't at the repo root).
3. Environment variables (Project Settings → Environment Variables):
   | Key | Value | Notes |
   |---|---|---|
   | `GATEWAY_URL` | `https://<your-app>.koyeb.app` | server-side only, no `NEXT_PUBLIC_` prefix |
   | `AEGIS_OPERATOR_KEY` | same value set on Koyeb in Step 3 | server-side only — this is exactly what `operator-console/README.md` warns must never be `NEXT_PUBLIC_` |
   | `NEXT_PUBLIC_GATEWAY_WS_URL` | `wss://<your-app>.koyeb.app/ws` | **must** be `wss://`, not `ws://` — a `https://` page (which Vercel always serves) will have the browser block a plain `ws://` connection as mixed content |
4. Deploy. Vercel gives you a `https://<project>.vercel.app` URL — that's the console.

## Step 5 — Prove it end-to-end

Point the real agent fleet at the deployed gateway from your own machine — it already
supports this via an environment variable, no code change needed:

```bash
cd agents
AEGIS_GATEWAY_URL=https://<your-app>.koyeb.app python fleet.py --duration 60
```

Open the Vercel URL while that's running: the fleet panel should show live spend, the
feed should show real allow/deny decisions arriving over `wss://`, and the kill switch
should halt every agent's next request within one round trip — the same behavior
verified locally and captured in `/demo-screenshots`, now running on infrastructure
nobody on the team is paying for.

## Honest limits of this setup

Consistent with how this project treats every other capability claim (see the NEAR AI
note in the root README): this is free, and free comes with real trade-offs, stated
plainly rather than glossed over.

- **Cold starts are real.** Koyeb's scale-to-zero and Vercel's serverless functions
  both add latency on a cold request. Fine for demoing to judges who click a link;
  not a substitute for the `<10ms` enforcement-path target, which is measured against
  the always-warm local stack, not this deployment.
- **Postgres can pause.** If nobody hits the gateway for 7 days, Supabase pauses the
  database and the next request fails until it's resumed (automatic on the next query
  in most cases, occasionally needs a manual click in the dashboard).
- **This is a demo deployment, not a production one.** One Koyeb instance means no
  redundancy — `docs/architecture.md`'s "any replica can serve any console" design
  is what makes scaling *possible*, but a free tier only gives you the one replica to
  prove it works, not to run it at scale.
