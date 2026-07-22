import httpx
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

OPA_AUTHZ_URL = "http://opa:8181/v1/data/aegis/authz"


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
    async with httpx.AsyncClient() as client:
        response = await client.post(
            OPA_AUTHZ_URL, json={"input": request.model_dump()}
        )
        response.raise_for_status()
    result = response.json().get("result", {})
    decision = {"allow": result.get("allow", False)}
    if "deny_reason" in result:
        decision["deny_reason"] = result["deny_reason"]
    return decision
