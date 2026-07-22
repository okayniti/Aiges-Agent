"""
Real agent reasoning via Groq's free API (no cost, no credits needed),
paired with the attestation interface from mock_attested_agent.py.

Reasoning here runs on Groq, which carries no TEE attestation of its own.
AttestedAgent.get_attestation_proof(live=True) still works and proves NEAR
AI Cloud's hardware is genuine — it does not and should not be presented
as covering this class's own reasoning. See mock_attested_agent.py's
docstring for the full honesty note.
"""

import os
from dataclasses import dataclass

import httpx

from mock_attested_agent import AttestedAgent

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
DEFAULT_MODEL = "llama-3.1-8b-instant"


@dataclass
class GroqReasoningAgent(AttestedAgent):
    model: str = DEFAULT_MODEL

    def decide(self, prompt: str) -> str:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY not set in environment")
        response = httpx.post(
            f"{GROQ_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": self.model,
                "messages": [
                    {
                        "role": "system",
                        "content": f"You are {self.agent_id}, a {self.role} agent. Respond concisely.",
                    },
                    {"role": "user", "content": prompt},
                ],
                "max_tokens": 200,
            },
            timeout=30,
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
