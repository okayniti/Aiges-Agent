import json
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
import redis.asyncio as redis
from fastapi import FastAPI
from pydantic import BaseModel

OPA_AUTHZ_URL = "http://opa:8181/v1/data/aegis/authz"
REDIS_URL = "redis://redis:6379"
CAPS_FILE = Path(__file__).parent / "caps.json"

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Seed default caps so a fresh stack is demo-ready. SETNX, not SET: an operator
    # who has already changed a cap keeps their value across a gateway restart.
    caps = json.loads(CAPS_FILE.read_text())
    for agent_id, cap in caps.items():
        await redis_client.setnx(f"cap:agent:{agent_id}", cap)
    yield


app = FastAPI(lifespan=lifespan)


class Agent(BaseModel):
    id: str
    role: str


class AgentActionRequest(BaseModel):
    agent: Agent
    action: str
    amount: float


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/agent-action")
async def agent_action(request: AgentActionRequest):
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
