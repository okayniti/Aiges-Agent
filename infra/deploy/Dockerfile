# Single-container build for free-tier hosts that give you one web service
# (Koyeb, or Render/Railway on a paid plan) rather than a docker-compose stack.
# Bundles OPA into the same image as the gateway and runs both processes via
# start.sh, so the whole enforcement path (gateway + policy engine) is one
# deployable unit -- no separate OPA service, no separate free-tier slot.
#
# Local development is unaffected -- docker compose still uses
# aegis-gateway/Dockerfile with OPA as its own container. This file only
# matters for a cloud deploy; see docs/deployment.md.
#
# Build context must be the repo root, e.g.:
#   docker build -f infra/deploy/Dockerfile -t aegis-gateway-bundled .

FROM openpolicyagent/opa:1.18.2-debug AS opa

FROM python:3.12-slim
WORKDIR /app

COPY --from=opa /opa /usr/local/bin/opa

COPY aegis-gateway/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY aegis-gateway/ .
COPY policies/ /policies

COPY infra/deploy/start.sh /start.sh
RUN chmod +x /start.sh

# OPA only needs to be reachable from this same container, not the outside
# world -- 127.0.0.1 keeps it off the host's public port entirely.
ENV OPA_URL=http://127.0.0.1:8181

EXPOSE 8000

CMD ["/start.sh"]
