#!/bin/sh
# Starts OPA in the background, waits for it to actually answer before letting
# any traffic reach the gateway (a request landing before OPA is up would have
# nothing to evaluate policy against), then execs uvicorn so it becomes PID 1
# and receives the host's shutdown signal directly.
set -e

opa run --server --addr=127.0.0.1:8181 /policies &

python - <<'PY'
import time
import urllib.request

for _ in range(60):
    try:
        urllib.request.urlopen("http://127.0.0.1:8181/health", timeout=1)
        break
    except Exception:
        time.sleep(0.5)
else:
    raise SystemExit("OPA did not become healthy in time")
PY

# Koyeb (and most PaaS hosts) assign the port at runtime via $PORT; 8000 is
# only the local fallback if this image is ever run standalone.
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
