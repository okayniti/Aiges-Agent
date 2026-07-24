"""The three simulated agents, driving real traffic through the Aegis Gateway.

Run this and every action goes through the gateway's three checks and lands in the
audit ledger. Nothing here talks to a banking API directly, which is the point.

An important property to notice while watching this run: when an agent is revoked,
it does not stop asking. It keeps issuing exactly the same actions and the gateway
keeps refusing them. Governance that depended on the agent choosing to stand down
would be worthless against a compromised or malfunctioning agent -- enforcement has
to live at the chokepoint, not in the agent's own good behaviour.

Behaviour is deterministic for a given --seed so a demo run can be repeated.

Usage:
    python agents/fleet.py --duration 20
    python agents/fleet.py --duration 20 --agent rogue-001
    AEGIS_GATEWAY_URL=http://gateway:8000 python agents/fleet.py
"""

import argparse
import asyncio
import os
import random
import time
from dataclasses import dataclass, field

import httpx

GATEWAY_URL = os.environ.get("AEGIS_GATEWAY_URL", "http://localhost:8001")


@dataclass
class Persona:
    """One simulated agent: who it is, how often it acts, and what it tries."""

    agent_id: str
    role: str
    interval: float
    description: str

    def next_action(self, rng: random.Random, step: int) -> tuple[str, float]:
        raise NotImplementedError


class WealthAdvisory(Persona):
    """Compliant baseline. Mostly reads balances, occasionally moves a modest sum.

    Exists so the demo has something that is *supposed* to be allowed. A console
    where everything is red proves nothing about the policy actually discriminating.
    """

    def next_action(self, rng, step):
        if step % 3 == 2:
            return "transfer", rng.choice([50.0, 75.0, 100.0, 125.0])
        return "query_balance", 0.0


class HighFrequencyTrader(Persona):
    """Legitimate but relentless. Small transfers, fast, until the cap stops it.

    This is the agent that demonstrates the spend cap without anyone misbehaving:
    every action is permitted by policy, and it still gets cut off once it has
    spent its budget. Policy and budget are genuinely separate controls.
    """

    def next_action(self, rng, step):
        if step % 5 == 4:
            return "query_balance", 0.0
        return "transfer", rng.choice([5.0, 10.0, 15.0, 20.0, 25.0])


class Rogue(Persona):
    """Anomalous agent whose role permits nothing at all.

    It escalates -- a large transfer, then probing reads, then an action that
    isn't even in the vocabulary -- and policy refuses all of it. The escalating
    amounts never matter, because the request never reaches the budget check;
    that ordering is visible in the deny reasons it collects.
    """

    SCRIPT = [
        ("transfer", 500.0),
        ("query_balance", 0.0),
        ("exfiltrate_funds", 5000.0),
        ("transfer", 25000.0),
    ]

    def next_action(self, rng, step):
        return self.SCRIPT[step % len(self.SCRIPT)]


PERSONAS = [
    WealthAdvisory(
        agent_id="wealth-001",
        role="wealth_advisory",
        interval=2.0,
        description="compliant: reads balances, occasional modest transfer",
    ),
    HighFrequencyTrader(
        agent_id="hft-001",
        role="hft",
        interval=0.4,
        description="permitted but relentless: small rapid transfers until capped",
    ),
    Rogue(
        agent_id="rogue-001",
        role="rogue",
        interval=1.2,
        description="anomalous: escalating attempts, permitted nothing",
    ),
]


@dataclass
class Tally:
    allowed: int = 0
    denied: dict[str, int] = field(default_factory=dict)
    errors: int = 0

    def record(self, decision: dict) -> None:
        if decision.get("allow"):
            self.allowed += 1
        else:
            reason = decision.get("deny_reason", "unknown")
            self.denied[reason] = self.denied.get(reason, 0) + 1

    @property
    def total(self) -> int:
        return self.allowed + sum(self.denied.values()) + self.errors


async def run_persona(
    client: httpx.AsyncClient, persona: Persona, stop_at: float, seed: int, tally: Tally
) -> None:
    # Each persona draws from its own stream so one agent's cadence cannot shift
    # another's choices, and a single --seed still reproduces the whole run.
    rng = random.Random(f"{seed}:{persona.agent_id}")
    step = 0
    started = time.monotonic()

    while time.monotonic() < stop_at:
        elapsed = time.monotonic() - started
        action, amount = persona.next_action(rng, step)
        try:
            response = await client.post(
                f"{GATEWAY_URL}/agent-action",
                json={
                    "agent": {"id": persona.agent_id, "role": persona.role},
                    "action": action,
                    "amount": amount,
                },
            )
            response.raise_for_status()
            decision = response.json()
            tally.record(decision)
            verdict = "ALLOW" if decision.get("allow") else "DENY "
            reason = decision.get("deny_reason", "")
            print(
                f"  {elapsed:5.1f}s  {persona.agent_id:<11} {action:<16} "
                f"{amount:>9.2f}  {verdict}  {reason}"
            )
        except httpx.HTTPError as exc:
            tally.errors += 1
            print(
                f"  {elapsed:5.1f}s  {persona.agent_id:<11} {action:<16} "
                f"{amount:>9.2f}  ERROR  {exc}"
            )

        step += 1
        await asyncio.sleep(persona.interval)


async def main(duration: float, seed: int, only: str | None) -> None:
    personas = [p for p in PERSONAS if only is None or p.agent_id == only]
    if not personas:
        raise SystemExit(f"no such agent: {only}")

    print(f"gateway  : {GATEWAY_URL}")
    print(f"duration : {duration}s    seed: {seed}")
    for persona in personas:
        print(f"  {persona.agent_id:<11} {persona.role:<16} every {persona.interval}s"
              f"  -- {persona.description}")
    print()

    tallies = {p.agent_id: Tally() for p in personas}
    stop_at = time.monotonic() + duration

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            await asyncio.gather(
                *(
                    run_persona(client, p, stop_at, seed, tallies[p.agent_id])
                    for p in personas
                )
            )
        except asyncio.CancelledError:
            pass

    print()
    print("summary")
    for agent_id, tally in tallies.items():
        denied = ", ".join(f"{k}={v}" for k, v in sorted(tally.denied.items())) or "-"
        print(
            f"  {agent_id:<11} sent={tally.total:<4} allowed={tally.allowed:<4} "
            f"denied[{denied}]"
            + (f" errors={tally.errors}" if tally.errors else "")
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--duration", type=float, default=15.0, help="seconds to run")
    parser.add_argument("--seed", type=int, default=7, help="reproducible behaviour")
    parser.add_argument("--agent", default=None, help="run only this agent id")
    args = parser.parse_args()

    try:
        asyncio.run(main(args.duration, args.seed, args.agent))
    except KeyboardInterrupt:
        print("\nstopped")
