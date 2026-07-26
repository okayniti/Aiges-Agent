"use client";

import { useGateway } from "@/lib/gateway-store";
import { Callout, Panel, PanelHeader } from "@/components/section";

const ACCENT = "#17C3A2";

export function PolicyPanel() {
  const { policy, error } = useGateway();

  if (!policy) {
    return (
      <Panel className="px-5 py-8 text-sm text-slate-500">
        {error ? `Gateway unreachable: ${error}` : "Loading policy…"}
      </Panel>
    );
  }

  const roleNames = Object.keys(policy.roles).sort();
  const actions = Array.from(new Set(Object.values(policy.roles).flat())).sort();

  return (
    <div className="space-y-5">
      <Panel className="overflow-hidden">
        <PanelHeader title="Permitted actions by role" meta="OPA-enforced · read-only" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800/60">
                <th className="px-5 py-3 text-left text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
                  role
                </th>
                {actions.map((action) => (
                  <th
                    key={action}
                    className="px-5 py-3 text-left font-mono text-[11px] font-normal text-slate-400"
                  >
                    {action}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roleNames.map((role) => (
                <tr key={role} className="border-b border-slate-800/40 last:border-0">
                  <td className="px-5 py-3.5 font-mono text-slate-200">{role}</td>
                  {actions.map((action) => {
                    const allowed = policy.roles[role].includes(action);
                    return (
                      <td key={action} className="px-5 py-3.5">
                        {allowed ? (
                          <span style={{ color: ACCENT }}>✓</span>
                        ) : (
                          <span className="text-slate-700">✗</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Callout label="Deny by default">
        A role with no entry for an action is refused — the{" "}
        <span className="font-mono text-slate-300">rogue</span> row is empty on purpose,
        so every request it makes is denied regardless of amount. This matrix is read
        straight from the same OPA data the gateway evaluates on each action, not a copy,
        so it cannot show a rule that differs from the one in force.
      </Callout>
    </div>
  );
}
