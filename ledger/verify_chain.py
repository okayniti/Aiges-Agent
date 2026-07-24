"""Recompute the audit ledger's hash chain and report any tampering.

This deliberately reimplements the hash rule from ledger/schema.sql rather than
importing the gateway's version. A verifier that shares code with the writer only
proves the writer is self-consistent; an independent one proves the rule stated in
the schema is the rule the rows actually follow.

Reads only the stored columns, so it works against a database dump, a replica, or
rows handed over by someone else.

Usage (from anywhere that can reach Postgres):
    python ledger/verify_chain.py
Exits 0 if the chain is intact, 1 if any row fails.
"""

import asyncio
import hashlib
import json
import os
import sys

import asyncpg

DSN = os.environ.get(
    "AEGIS_POSTGRES_DSN",
    "postgresql://postgres:aegis_dev_password@postgres:5432/aegis",
)
GENESIS_HASH = "0" * 64


def expected_hash(prev_hash, row):
    payload = json.dumps(
        {
            "ts": row["ts"].isoformat(),
            "agent_id": row["agent_id"],
            "agent_role": row["agent_role"],
            "action": row["action"],
            "amount": f"{row['amount']:.2f}",
            "allowed": row["allowed"],
            "deny_reason": row["deny_reason"],
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256((prev_hash + payload).encode()).hexdigest()


async def main():
    conn = await asyncpg.connect(DSN)
    try:
        rows = await conn.fetch(
            """
            SELECT id, ts, agent_id, agent_role, action, amount,
                   allowed, deny_reason, prev_hash, hash
            FROM audit_log ORDER BY id
            """
        )
    finally:
        await conn.close()

    failures = []
    prev_hash = GENESIS_HASH

    for row in rows:
        # Two independent things can be wrong: the row may not link to the row
        # before it, or its contents may not match its own hash.
        if row["prev_hash"] != prev_hash:
            failures.append(
                f"row {row['id']}: broken link -- prev_hash is {row['prev_hash'][:16]}..., "
                f"expected {prev_hash[:16]}..."
            )
        recomputed = expected_hash(row["prev_hash"], row)
        if recomputed != row["hash"]:
            failures.append(
                f"row {row['id']}: contents altered -- stored hash {row['hash'][:16]}..., "
                f"recomputed {recomputed[:16]}..."
            )
        prev_hash = row["hash"]

    print(f"rows checked : {len(rows)}")
    if failures:
        print(f"result       : TAMPERED ({len(failures)} problem(s))")
        for failure in failures:
            print(f"  - {failure}")
        return 1

    print("result       : INTACT -- every row hashes to its stored value")
    if rows:
        print(f"chain head   : {rows[-1]['hash']}")
    return 0


sys.exit(asyncio.run(main()))
