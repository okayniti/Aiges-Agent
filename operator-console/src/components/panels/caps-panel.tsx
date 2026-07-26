"use client";

import { useGateway } from "@/lib/gateway-store";
import { stagger } from "@/lib/motion-tokens";
import { Reveal } from "@/components/reveal";
import { Callout, Panel } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { CapEditor } from "@/components/policy/cap-editor";

export function CapsPanel() {
  const { policy, fleet, error } = useGateway();

  if (!policy) {
    return (
      <Panel className="px-5 py-8 text-sm text-slate-500">
        {error ? `Gateway unreachable: ${error}` : "Loading caps…"}
      </Panel>
    );
  }

  // Spend comes from the live fleet state so the "spent against this cap" figure
  // moves with the feed rather than sitting at whatever it was on page load.
  const spentFor = (id: string) =>
    fleet?.agents.find((a) => a.id === id)?.spent ?? null;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {policy.agents.map((agent, i) => {
          const spent = spentFor(agent.id);
          return (
            <Reveal key={agent.id} delay={i * stagger}>
              <Panel className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-[15px] text-slate-100">{agent.id}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                      {agent.role}
                    </div>
                  </div>
                  <Badge variant="outline">
                    {agent.permitted_actions.length === 0
                      ? "no actions"
                      : `${agent.permitted_actions.length} actions`}
                  </Badge>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {agent.permitted_actions.length === 0 ? (
                    <span className="text-xs text-slate-600">
                      nothing permitted by policy
                    </span>
                  ) : (
                    agent.permitted_actions.map((action) => (
                      <Badge key={action} variant="secondary" className="font-mono">
                        {action}
                      </Badge>
                    ))
                  )}
                </div>

                <div className="mt-5 border-t border-slate-800/60 pt-4">
                  <CapEditor agentId={agent.id} cap={agent.cap} />
                  {spent !== null && (
                    <p className="mt-2 text-[11px] text-slate-500">
                      Spent so far{" "}
                      <span className="font-mono tabular-nums text-slate-400">
                        {Number(spent).toFixed(2)}
                      </span>
                    </p>
                  )}
                </div>
              </Panel>
            </Reveal>
          );
        })}
      </div>

      <Callout label="Takes effect on the next action">
        Caps are held in Redis and checked atomically per request, so a cap saved here
        applies to the very next action that agent attempts — no agent restart, no
        redeploy. Lowering a cap below what an agent has already spent does not claw the
        spend back; it simply means the next spend is refused.
      </Callout>
    </div>
  );
}
