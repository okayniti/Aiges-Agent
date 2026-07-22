"""
MOCK — structurally identical interface to the real NEAR AI SDK per
docs/near-ai-findings.md. Swap the internals of get_attestation_proof()
for a real inference-side SDK call once agent reasoning also routes
through an attested TEE provider, not just this verification demo.

Context (2026-07-22): NEAR AI Cloud sandbox access is real — the API key
in .env authenticates successfully. What's actually blocked is paying for
inference credits ("No spending limit configured"), not the platform
itself, and that's a student-budget problem, not a technical one.

NEAR AI Cloud's attestation endpoint needs no API key and no credits at
all (verified live, twice, from two independent no-auth requests). So
get_attestation_proof(live=True) below calls it for real. Default is
live=False — a fast, offline, fake signature — so a live demo never
depends on network access or NEAR AI Cloud's uptime. Flip to live=True to
show a judge a genuine, independently-verifiable hardware attestation
report on the spot.

Important honesty note: a live=True report proves NEAR's TEE hardware is
running the named model. It does NOT prove this agent's own reasoning ran
there — that reasoning runs on whatever free LLM (e.g. Groq) is wired in
separately. Don't present a live report as covering the agent's own logic;
it demonstrates the attestation mechanism, not this agent's execution.
"""

import os
import secrets
import time
from dataclasses import dataclass

import httpx

NEAR_AI_BASE_URL = os.environ.get("NEAR_AI_BASE_URL", "https://cloud-api.near.ai/v1")
ATTESTED_MODEL = "openai/gpt-oss-120b"  # any TEE-hosted model works; attestation needs no credits


@dataclass
class AttestedAgent:
    agent_id: str
    role: str

    def get_attestation_proof(self, live: bool = False) -> dict:
        if live:
            return self._fetch_real_attestation()
        return self._fake_attestation()

    def _fake_attestation(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "role": self.role,
            "timestamp": time.time(),
            "signature": secrets.token_hex(32),
            "source": "MOCK — locally generated, not a real hardware attestation",
        }

    def _fetch_real_attestation(self) -> dict:
        nonce = secrets.token_hex(32)
        response = httpx.get(
            f"{NEAR_AI_BASE_URL}/attestation/report",
            params={"model": ATTESTED_MODEL, "signing_algo": "ecdsa", "nonce": nonce},
            timeout=30,
        )
        response.raise_for_status()
        return {
            "agent_id": self.agent_id,
            "role": self.role,
            "timestamp": time.time(),
            "nonce": nonce,
            "source": (
                f"REAL — live NEAR AI Cloud attestation report for {ATTESTED_MODEL}. "
                "Proves NEAR's TEE hardware, not this agent's own reasoning."
            ),
            "near_ai_report": response.json(),
        }
