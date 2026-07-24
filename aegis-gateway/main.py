import hashlib
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import asyncpg
import httpx
import redis.asyncio as redis
from fastapi import FastAPI
from pydantic import BaseModel

OPA_AUTHZ_URL = "http://opa:8181/v1/data/aegis/authz"
REDIS_URL = "redis://redis:6379"
POSTGRES_DSN = "postgresql://postgres:aegis_dev_password@postgres:5432/aegis"
CAPS_FILE = Path(__file__).parent / "caps.json"

# The chain has to start somewhere; the first row links to 64 zeros.
GENESIS_HASH = "0" * 64

# Appending to the ledger takes this advisory lock so concurrent requests append
# in a single order. Without it two requests can read the same previous hash and
# write two rows claiming the same predecessor, forking the chain.
AUDIT_LOCK_KEY = 91827364501

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pg_pool

    # Seed default caps so a fresh stack is demo-ready. SETNX, not SET: an operator
    # who has already changed a cap keeps their value across a gateway restart.
    caps = json.loads(CAPS_FILE.read_text())
    for agent_id, cap in caps.items():
        await redis_client.setnx(f"cap:agent:{agent_id}", cap)

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


async def append_audit(request: AgentActionRequest, decision: dict) -> None:
    """Append one decision to the hash-chained ledger.

    Deliberately not wrapped in try/except: if the decision cannot be recorded,
    the request fails rather than returning an allow that left no trace.
    """
    ts = datetime.now(timezone.utc)
    amount = Decimal(f"{request.amount:.2f}")
    allowed = decision["allow"]
    deny_reason = decision.get("deny_reason")

    async with pg_pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock($1)", AUDIT_LOCK_KEY)
            prev_hash = (
                await conn.fetchval("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1")
                or GENESIS_HASH
            )
            payload = canonical_payload(
                ts,
                request.agent.id,
                request.agent.role,
                request.action,
                amount,
                allowed,
                deny_reason,
            )
            await conn.execute(
                """
                INSERT INTO audit_log (
                    ts, agent_id, agent_role, action, amount,
                    allowed, deny_reason, prev_hash, hash
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """,
                ts,
                request.agent.id,
                request.agent.role,
                request.action,
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
    await append_audit(request, decision)
    return decision
