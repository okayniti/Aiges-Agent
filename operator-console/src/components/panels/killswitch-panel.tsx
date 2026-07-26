"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

import { useGateway } from "@/lib/gateway-store";
import { duration } from "@/lib/motion-tokens";
import { Callout, Panel } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ACCENT = "#17C3A2";
const REVOKED = "#f43f5e";

// Every way to halt an agent, in one place: the fleet-wide stop and the
// per-agent revocations, with each agent's current state next to its own control.
export function KillSwitchPanel() {
  const { fleet, pending, killFleet, reviveFleet, killAgent, reviveAgent, error } =
    useGateway();

  const bannerRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const fleetRevoked = fleet?.fleetRevoked ?? false;

  // Flash the banner whenever the fleet-wide state flips.
  useEffect(() => {
    if (!mounted.current || !bannerRef.current) return;
    gsap.fromTo(
      bannerRef.current,
      { backgroundColor: fleetRevoked ? "rgba(244,63,94,0.25)" : "rgba(23,195,162,0.20)" },
      { backgroundColor: "rgba(0,0,0,0)", duration: duration.slow, ease: "power2.out" },
    );
  }, [fleetRevoked]);

  useEffect(() => {
    mounted.current = true;
  }, []);

  if (!fleet) {
    return (
      <Panel className="px-5 py-8 text-sm text-slate-500">
        {error ? `Gateway unreachable: ${error}` : "Loading fleet…"}
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <Panel className="overflow-hidden">
        <div
          ref={bannerRef}
          className="flex flex-wrap items-center justify-between gap-4 px-6 py-6"
        >
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
              Fleet-wide kill switch
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">
              {fleetRevoked ? (
                <span style={{ color: REVOKED }}>ENGAGED — all agents blocked</span>
              ) : (
                <span style={{ color: ACCENT }}>Armed — agents operating</span>
              )}
            </div>
            <p className="mt-2 max-w-xl text-[13px] text-slate-500">
              Enforced at the gateway, not in the agents. A halted agent keeps sending
              requests; every one of them is refused before it reaches a banking API.
            </p>
          </div>

          {fleetRevoked ? (
            <Button
              variant="outline"
              size="lg"
              disabled={pending.has("POST /restore fleet")}
              onClick={reviveFleet}
            >
              Restore fleet
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="lg"
              disabled={pending.has("POST /revoke fleet")}
              onClick={killFleet}
            >
              Kill fleet
            </Button>
          )}
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="divide-y divide-slate-800/60">
          {fleet.agents.map((agent) => {
            const busy =
              pending.has(`POST /revoke ${agent.id}`) ||
              pending.has(`POST /restore ${agent.id}`);
            return (
              <div
                key={agent.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ backgroundColor: agent.revoked ? REVOKED : ACCENT }}
                  />
                  <span className="font-mono text-sm text-slate-100">{agent.id}</span>
                  <Badge variant="outline">{agent.role}</Badge>
                  {agent.revoked ? (
                    <Badge variant="destructive">REVOKED</Badge>
                  ) : (
                    <Badge style={{ backgroundColor: ACCENT, color: "#020617" }}>
                      LIVE
                    </Badge>
                  )}
                  {agent.revoked && !agent.revoked_individually && (
                    <span className="text-[11px] text-slate-500">via fleet stop</span>
                  )}
                </div>

                {agent.revoked_individually ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => reviveAgent(agent.id)}
                  >
                    Restore agent
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy || fleetRevoked}
                    onClick={() => killAgent(agent.id)}
                  >
                    {fleetRevoked ? "Fleet kill active" : "Revoke agent"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      <Callout label="One signal, every agent">
        The stop is a single flag the gateway reads on every request, fanned out to open
        consoles over Redis Pub/Sub. There is no per-agent shutdown script and no polling
        interval to wait through — the next request each agent makes is already denied.
      </Callout>
    </div>
  );
}
