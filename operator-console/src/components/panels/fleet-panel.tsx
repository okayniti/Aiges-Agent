"use client";

import { useGateway } from "@/lib/gateway-store";
import { stagger } from "@/lib/motion-tokens";
import { Reveal } from "@/components/reveal";
import { Panel, PanelHeader } from "@/components/section";
import { AgentCard } from "@/components/fleet/agent-card";
import { SpendChart } from "@/components/fleet/spend-chart";

export function FleetPanel() {
  const { fleet, error } = useGateway();

  if (!fleet) {
    return (
      <Panel className="px-5 py-8 text-sm text-slate-500">
        {error ? `Gateway unreachable: ${error}` : "Loading fleet…"}
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader title="Spend against budget" meta="live, per agent" />
        <div className="px-3 py-5">
          <SpendChart agents={fleet.agents} />
        </div>
      </Panel>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {fleet.agents.map((agent, i) => (
          <Reveal key={agent.id} delay={i * stagger}>
            <AgentCard agent={agent} />
          </Reveal>
        ))}
      </div>
    </div>
  );
}
