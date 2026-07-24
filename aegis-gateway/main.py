import hashlib
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Literal

import asyncpg
import httpx
import redis.asyncio as redis
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

OPA_AUTHZ_URL = "http://opa:8181/v1/data/aegis/authz"
REDIS_URL = "redis://redis:6379"
POSTGRES_DSN = "postgresql://postgres:aegis_dev_password@postgres:5432/aegis"
AGENTS_FILE = Path(__file__).parent / "agents.json"

# The chain has to start somewhere; the first row links to 64 zeros.
GENESIS_HASH = "0" * 64

# Appending to the ledger takes this advisory lock so concurrent requests append
# in a single order. Without it two requests can read the same previous hash and
# write two rows claiming the same predecessor, forking the chain.
AUDIT_LOCK_KEY = 91827364501

# Operator actions are recorded in the same chain as agent actions, so revoking
# the fleet is as tamper-evident as any decision. agent_role is the actor
# ("operator"), agent_id is the subject -- the agent acted on, or FLEET_SUBJECT
# when the whole fleet is.
OPERATOR_ROLE = "operator"
FLEET_SUBJECT = "*"

# Check-and-increment of an agent's spend against its cap, run inside Redis so the
# whole thing is one atomic step. Splitting it into GET-then-INCRBYFLOAT would let
# two concurrent actions both read the same under-cap total and both be allowed,
# pushing the agent over its cap.
#
# KEYS[1] = spent key, KEYS[2] = cap key, ARGV[1] = amount.
# Returns {status, spent, cap} where status is 0=within cap, 1=cap exceeded,
# 2=no cap configured. Numbers are returned as strings because Redis truncates
# Lua numbers to integers on the way out.
SPEND_CAP_LUA = """
local cap = redis.call('GET', KEYS[2])
if not cap then
    return {2, '0', '0'}
end
local spent = tonumber(redis.call('GET', KEYS[1]) or '0')
local amount = tonumber(ARGV[1])
if spent + amount > tonumber(cap) then
    return {1, tostring(spent), cap}
end
local new_spent = redis.call('INCRBYFLOAT', KEYS[1], ARGV[1])
return {0, new_spent, cap}
"""

redis_client = redis.from_url(REDIS_URL, decode_responses=True)
spend_cap_script = redis_client.register_script(SPEND_CAP_LUA)

pg_pool: asyncpg.Pool | None = None
agent_registry: dict[str, dict] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pg_pool, agent_registry

    # Seed default caps so a fresh stack is demo-ready. SETNX, not SET: an operator
    # who has already changed a cap keeps their value across a gateway restart.
    agent_registry = json.loads(AGENTS_FILE.read_text())
    for agent_id, entry in agent_registry.items():
        await redis_client.setnx(f"cap:agent:{agent_id}", entry["cap"])

    pg_pool = await asyncpg.create_pool(POSTGRES_DSN)
    try:
        yield
    finally:
        await pg_pool.close()


app = FastAPI(lifespan=lifespan)


class Agent(BaseModel):
    id: str
    role: str


class AgentActionRequest(BaseModel):
    agent: Agent
    action: str
    amount: float


class RevokeRequest(BaseModel):
    scope: Literal["agent", "fleet"]
    agent_id: str | None = None


def canonical_payload(
    ts: datetime,
    agent_id: str,
    agent_role: str,
    action: str,
    amount: Decimal,
    allowed: bool,
    deny_reason: str | None,
) -> str:
    """Render a decision to the exact bytes that get hashed.

    Sorted keys and no whitespace so the payload is byte-identical everywhere,
    and amount to a fixed two decimal places so it round-trips through the
    NUMERIC(20,2) column unchanged. Anyone can rebuild this from a stored row.
    """
    return json.dumps(
        {
            "ts": ts.isoformat(),
            "agent_id": agent_id,
            "agent_role": agent_role,
            "action": action,
            "amount": f"{amount:.2f}",
            "allowed": allowed,
            "deny_reason": deny_reason,
        },
        sort_keys=True,
        separators=(",", ":"),
    )


def row_hash(prev_hash: str, payload: str) -> str:
    return hashlib.sha256((prev_hash + payload).encode()).hexdigest()


async def append_ledger(
    agent_id: str,
    agent_role: str,
    action: str,
    amount: Decimal,
    allowed: bool,
    deny_reason: str | None,
) -> None:
    """Append one entry to the hash-chained ledger.

    Deliberately not wrapped in try/except: if an event cannot be recorded, the
    request fails rather than succeeding with no trace.
    """
    ts = datetime.now(timezone.utc)
    async with pg_pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock($1)", AUDIT_LOCK_KEY)
            prev_hash = (
                await conn.fetchval("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1")
                or GENESIS_HASH
            )
            payload = canonical_payload(
                ts, agent_id, agent_role, action, amount, allowed, deny_reason
            )
            await conn.execute(
                """
                INSERT INTO audit_log (
                    ts, agent_id, agent_role, action, amount,
                    allowed, deny_reason, prev_hash, hash
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """,
                ts,
                agent_id,
                agent_role,
                action,
                amount,
                allowed,
                deny_reason,
                prev_hash,
                row_hash(prev_hash, payload),
            )


async def decide(request: AgentActionRequest) -> dict:
    """Run the three checks in order: revocation, then policy, then spend cap."""
    revoked = await redis_client.exists(
        "killswitch:fleet", f"killswitch:agent:{request.agent.id}"
    )
    if revoked:
        return {"allow": False, "deny_reason": "revoked"}

    async with httpx.AsyncClient() as client:
        response = await client.post(
            OPA_AUTHZ_URL, json={"input": request.model_dump()}
        )
        response.raise_for_status()
    result = response.json().get("result", {})
    if not result.get("allow", False):
        decision = {"allow": False}
        if "deny_reason" in result:
            decision["deny_reason"] = result["deny_reason"]
        return decision

    # Only actions that move money consume budget, so a permitted read-only action
    # (amount 0) never needs a cap to be configured.
    if request.amount > 0:
        status, spent, cap = await spend_cap_script(
            keys=[
                f"spent:agent:{request.agent.id}",
                f"cap:agent:{request.agent.id}",
            ],
            args=[request.amount],
        )
        if status == 2:
            # Fail closed: an agent with no configured cap has no spending authority.
            return {"allow": False, "deny_reason": "no_cap_configured"}
        if status == 1:
            return {
                "allow": False,
                "deny_reason": "cap_exceeded",
                "spent": float(spent),
                "cap": float(cap),
            }

    return {"allow": True}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/agent-action")
async def agent_action(request: AgentActionRequest):
    decision = await decide(request)
    await append_ledger(
        request.agent.id,
        request.agent.role,
        request.action,
        Decimal(f"{request.amount:.2f}"),
        decision["allow"],
        decision.get("deny_reason"),
    )
    return decision


async def set_revocation(request: RevokeRequest, revoked: bool) -> dict:
    if request.scope == "agent" and not request.agent_id:
        raise HTTPException(status_code=400, detail="agent_id is required for scope=agent")

    if request.scope == "fleet":
        key, subject = "killswitch:fleet", FLEET_SUBJECT
    else:
        key, subject = f"killswitch:agent:{request.agent_id}", request.agent_id

    if revoked:
        await redis_client.set(key, 1)
    else:
        await redis_client.delete(key)

    await append_ledger(
        subject,
        OPERATOR_ROLE,
        "revoke" if revoked else "restore",
        Decimal("0.00"),
        True,
        None,
    )
    return {"scope": request.scope, "agent_id": request.agent_id, "revoked": revoked}


@app.post("/revoke")
async def revoke(request: RevokeRequest):
    return await set_revocation(request, revoked=True)


@app.post("/restore")
async def restore(request: RevokeRequest):
    return await set_revocation(request, revoked=False)


@app.get("/fleet")
async def fleet():
    """Live state of every registered agent, including a spend reconciliation.

    Spend is tracked twice by design: Redis holds the running total the cap check
    reads, and the ledger holds the exact NUMERIC(20,2) record of what was
    actually allowed. Redis INCRBYFLOAT is binary floating point (long double),
    the ledger is exact decimal, so this reports both and whether they agree to
    the cent rather than assuming they must.

    A mismatch is meaningful, not noise: it means Redis spend state was reset
    independently of the ledger, or the two genuinely drifted apart.
    """
    fleet_revoked = bool(await redis_client.exists("killswitch:fleet"))

    async with pg_pool.acquire() as conn:
        ledger_spend = {
            row["agent_id"]: row["total"]
            for row in await conn.fetch(
                """
                SELECT agent_id, COALESCE(SUM(amount), 0) AS total
                FROM audit_log
                WHERE allowed = true AND agent_role <> $1
                GROUP BY agent_id
                """,
                OPERATOR_ROLE,
            )
        }

    agents = []
    for agent_id, entry in agent_registry.items():
        cap_raw = await redis_client.get(f"cap:agent:{agent_id}")
        spent_raw = await redis_client.get(f"spent:agent:{agent_id}")
        agent_revoked = bool(await redis_client.exists(f"killswitch:agent:{agent_id}"))

        cap = Decimal(cap_raw) if cap_raw is not None else None
        redis_spent = Decimal(spent_raw or "0").quantize(Decimal("0.01"))
        from_ledger = Decimal(ledger_spend.get(agent_id, 0)).quantize(Decimal("0.01"))

        agents.append(
            {
                "id": agent_id,
                "role": entry["role"],
                "cap": str(cap) if cap is not None else None,
                "spent": str(redis_spent),
                "remaining": str(cap - redis_spent) if cap is not None else None,
                "revoked": agent_revoked or fleet_revoked,
                "revoked_individually": agent_revoked,
                "spend_reconciliation": {
                    "redis": str(redis_spent),
                    "ledger": str(from_ledger),
                    "agrees_to_the_cent": redis_spent == from_ledger,
                },
            }
        )

    return {"fleet_revoked": fleet_revoked, "agents": agents}


@app.get("/audit")
async def audit(limit: int = 50):
    """Recent ledger entries, newest first, plus the chain's integrity status.

    The integrity flag here is the writer checking its own output, which only
    proves self-consistency. ledger/verify_chain.py reimplements the rule from
    the schema independently -- that is the check to trust, and the one to run
    if this ever disagrees.

    Verification walks the whole chain, not just the returned window, since a
    window cannot prove its own prefix. That is O(rows) per call, which is fine
    at demo scale and would need a checkpoint scheme in production.
    """
    limit = max(1, min(limit, 500))

    async with pg_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, ts, agent_id, agent_role, action, amount,
                   allowed, deny_reason, prev_hash, hash
            FROM audit_log ORDER BY id
            """
        )

    intact = True
    broken_at = None
    prev_hash = GENESIS_HASH
    for row in rows:
        payload = canonical_payload(
            row["ts"],
            row["agent_id"],
            row["agent_role"],
            row["action"],
            row["amount"],
            row["allowed"],
            row["deny_reason"],
        )
        if row["prev_hash"] != prev_hash or row_hash(row["prev_hash"], payload) != row["hash"]:
            intact = False
            broken_at = row["id"]
            break
        prev_hash = row["hash"]

    return {
        "chain": {
            "intact": intact,
            "rows": len(rows),
            "broken_at": broken_at,
            "head": rows[-1]["hash"] if rows else None,
        },
        "entries": [
            {
                "id": row["id"],
                "ts": row["ts"].isoformat(),
                "agent_id": row["agent_id"],
                "agent_role": row["agent_role"],
                "action": row["action"],
                # A string, not a float: the ledger's whole point is exactness,
                # and JSON numbers would reintroduce binary floating point.
                "amount": str(row["amount"]),
                "allowed": row["allowed"],
                "deny_reason": row["deny_reason"],
                "hash": row["hash"],
                "prev_hash": row["prev_hash"],
            }
            for row in reversed(rows[-limit:])
        ],
    }
