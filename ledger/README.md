# ledger

Postgres schema and migrations for the audit log — the durable record of every action an
agent attempted, whether it was allowed or blocked, and why. This is the system of record
used for after-the-fact review and compliance.

`schema.sql` defines the `audit_log` table and documents the exact hash rule. Each row
stores the hash of the row before it, so altering any historical row breaks both its own
hash and the link every later row depends on.

`verify_chain.py` recomputes the chain and reports tampering, exiting non-zero if any row
fails. It reimplements the hash rule from the schema rather than importing the gateway's
code, and reads only stored columns — so it verifies the documented rule, and works
against a dump or a replica.

The gateway image already has `asyncpg` and sits on the compose network, so the least
setup is to copy the script in and run it there:

```bash
docker cp ledger/verify_chain.py infra-gateway-1:/tmp/verify_chain.py
docker exec infra-gateway-1 python /tmp/verify_chain.py
```

To run it from the host instead, install `asyncpg` and point it at the mapped port —
the default DSN uses the in-network hostname `postgres`, which does not resolve outside
Compose:

```bash
AEGIS_POSTGRES_DSN=postgresql://postgres:aegis_dev_password@localhost:5433/aegis \
  python ledger/verify_chain.py
```

The schema is applied by the Postgres entrypoint on first init of an empty data directory;
see `infra/README.md` for how to apply changes to it.
