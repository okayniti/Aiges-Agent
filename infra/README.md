# infra

Docker Compose configuration that wires together OPA, Redis, Postgres, and the Aegis
Gateway so the full stack can be run locally with a single command. This is the local
equivalent of how the system would be deployed.

See `docker-compose.yml` for the current service definitions.

## Running the stack

From the repo root:

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

**Always pass `--build`. Never bring the stack up with a plain `up -d`.**

This is not a style preference — it has already cost us a debugging session. Compose does
not rebuild an image just because the source changed, and `--force-recreate` only recreates
*containers*, not images. A plain `up -d` will happily start a gateway image built from
older code, so the service runs, reports healthy, and answers requests — while silently
missing whatever you just committed. The failure looks like a logic bug in code that is
actually correct.

If gateway behaviour does not match the source, check what the container is really running
before debugging the code:

```bash
docker exec infra-gateway-1 cat /app/main.py
```

## Paths and the bind mounts

Compose resolves the relative volume mounts (`../policies`, `../ledger/schema.sql`) against
the location of the compose file, and remembers the project's path from when it was first
brought up. If the repo directory is **renamed or moved**, an already-registered project can
keep pointing at the old path — which mounts an empty directory instead of failing loudly.
OPA then runs with zero policies loaded and denies everything.

To confirm OPA actually has the policies:

```bash
docker exec infra-opa-1 opa test /policies -v      # expect PASS: 3/3
curl http://localhost:8181/v1/policies             # expect a non-empty result
```

If it comes back empty, recreate the project from the current path:

```bash
docker compose -f infra/docker-compose.yml down
docker compose -f infra/docker-compose.yml up -d --build
```

## Database schema

`ledger/schema.sql` is mounted into the Postgres entrypoint's init directory, which only
runs on **first init of an empty data directory**. Editing the schema and restarting does
nothing. To apply schema changes, recreate the volume:

```bash
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up -d --build
```

Note `down -v` discards the audit ledger along with the volume.

## Host ports

Host ports are remapped to avoid colliding with anything else running locally:

| Service  | Host  | Container |
|----------|-------|-----------|
| gateway  | 8001  | 8000      |
| opa      | 8181  | 8181      |
| redis    | 6380  | 6379      |
| postgres | 5433  | 5432      |

Inside the compose network, services reach each other by service name on the *container*
port — `http://opa:8181`, `redis://redis:6379`, `postgres:5432`.
