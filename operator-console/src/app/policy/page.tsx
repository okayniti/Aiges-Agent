"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchPolicy, type PolicyResponse } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CapEditor } from "@/components/policy/cap-editor";

const ACCENT = "#17C3A2";

export default function PolicyPage() {
  const [policy, setPolicy] = useState<PolicyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPolicy(await fetchPolicy());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load policy");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCapSaved = useCallback((agentId: string, newCap: string) => {
    setPolicy((prev) =>
      prev
        ? {
            ...prev,
            agents: prev.agents.map((a) =>
              a.id === agentId ? { ...a, cap: newCap } : a,
            ),
          }
        : prev,
    );
  }, []);

  if (!policy) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error ? `Gateway unreachable: ${error}` : "Loading policy…"}
        </p>
      </div>
    );
  }

  const roleNames = Object.keys(policy.roles).sort();
  const actions = Array.from(new Set(Object.values(policy.roles).flat())).sort();

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Policy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Permissions are read-only — sourced live from the OPA data the gateway
          evaluates on every action. Spend caps are editable below.
        </p>
      </div>

      {/* Read-only permission matrix, straight from what the gateway enforces */}
      <div className="rounded-lg border border-slate-800">
        <div className="border-b border-slate-800 px-4 py-2 text-sm font-medium">
          Permitted actions by role{" "}
          <span className="text-xs font-normal text-muted-foreground">
            (OPA-enforced · read-only)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">role</th>
                {actions.map((action) => (
                  <th key={action} className="px-4 py-2 text-left font-mono text-xs font-medium">
                    {action}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roleNames.map((role) => (
                <tr key={role} className="border-t border-slate-800/60">
                  <td className="px-4 py-2 font-mono">{role}</td>
                  {actions.map((action) => {
                    const allowed = policy.roles[role].includes(action);
                    return (
                      <td key={action} className="px-4 py-2">
                        {allowed ? (
                          <span style={{ color: ACCENT }}>✓</span>
                        ) : (
                          <span className="text-muted-foreground/40">✗</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-agent spend caps — editable */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {policy.agents.map((agent) => (
          <Card key={agent.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="font-mono">{agent.id}</span>
                <Badge variant="outline">{agent.role}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {agent.permitted_actions.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    no permitted actions
                  </span>
                ) : (
                  agent.permitted_actions.map((action) => (
                    <Badge key={action} variant="secondary" className="font-mono">
                      {action}
                    </Badge>
                  ))
                )}
              </div>
              <CapEditor
                agentId={agent.id}
                cap={agent.cap}
                onSaved={(newCap) => onCapSaved(agent.id, newCap)}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      {error && <p className="text-xs text-rose-400">Last error: {error}</p>}
    </div>
  );
}
