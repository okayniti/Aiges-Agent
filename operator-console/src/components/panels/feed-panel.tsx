"use client";

import { useGateway } from "@/lib/gateway-store";
import { Panel, PanelHeader } from "@/components/section";
import { FeedRowItem } from "@/components/audit/feed-row";

export function FeedPanel() {
  const { rows, error, freshIds, wsStatus } = useGateway();

  const allowed = rows.filter((r) => r.agent_role !== "operator" && r.allowed).length;
  const denied = rows.filter((r) => r.agent_role !== "operator" && !r.allowed).length;
  const operator = rows.filter((r) => r.agent_role === "operator").length;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Decision stream"
        meta={`${wsStatus} · newest first`}
        action={
          <div className="flex items-center gap-4 text-[11px] uppercase tracking-[0.12em]">
            <span className="text-slate-500">
              <span className="font-mono text-[#17C3A2]">{allowed}</span> allowed
            </span>
            <span className="text-slate-500">
              <span className="font-mono text-rose-400">{denied}</span> denied
            </span>
            <span className="text-slate-500">
              <span className="font-mono text-slate-300">{operator}</span> operator
            </span>
          </div>
        }
      />

      <div className="grid grid-cols-[64px_84px_1fr_120px_88px_1fr] gap-2 border-b border-slate-800/80 bg-slate-900/30 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
        <span>id</span>
        <span>time</span>
        <span>agent</span>
        <span>action</span>
        <span className="text-right">amount</span>
        <span className="text-right">outcome · hash</span>
      </div>

      <div className="max-h-[58vh] overflow-y-auto">
        {rows.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm text-slate-500">
            {error ? `Gateway unreachable: ${error}` : "Waiting for ledger activity…"}
          </div>
        ) : (
          rows.map((row) => (
            <FeedRowItem key={row.id} row={row} fresh={freshIds.current.has(row.id)} />
          ))
        )}
      </div>
    </Panel>
  );
}
