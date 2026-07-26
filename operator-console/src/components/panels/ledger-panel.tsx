"use client";

import { useGateway } from "@/lib/gateway-store";
import { Callout, Panel } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ACCENT = "#17C3A2";

export function LedgerPanel() {
  const { chain, sinceVerify, verifying, verify, error } = useGateway();

  return (
    <div className="space-y-5">
      <Panel className="px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
              Hash-chain integrity
            </div>

            <div className="mt-3">
              {chain === null ? (
                <Badge variant="outline">verifying…</Badge>
              ) : chain.intact ? (
                <span
                  className="text-2xl font-semibold tracking-tight"
                  style={{ color: ACCENT }}
                >
                  CHAIN INTACT
                </span>
              ) : (
                <span className="text-2xl font-semibold tracking-tight text-rose-400">
                  CHAIN TAMPERED — breaks at #{chain.broken_at}
                </span>
              )}
            </div>

            {chain && (
              <dl className="mt-5 grid grid-cols-2 gap-x-10 gap-y-3 text-[13px] sm:grid-cols-3">
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    rows verified
                  </dt>
                  <dd className="mt-1 font-mono tabular-nums text-slate-200">
                    {chain.rows.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    appended since
                  </dt>
                  <dd className="mt-1 font-mono tabular-nums text-slate-200">
                    {sinceVerify > 0 ? `+${sinceVerify}` : "—"}
                  </dd>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <dt className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    chain head
                  </dt>
                  <dd className="mt-1 truncate font-mono text-slate-400" title={chain.head ?? ""}>
                    {chain.head ? chain.head.slice(0, 20) : "—"}
                  </dd>
                </div>
              </dl>
            )}
          </div>

          <Button variant="outline" disabled={verifying} onClick={verify}>
            {verifying ? "Verifying…" : "Re-verify chain"}
          </Button>
        </div>
      </Panel>

      <Callout label="What this check does and does not prove">
        Re-verify walks the whole ledger and recomputes every row&apos;s hash, so editing
        any historic row breaks both its own hash and the link every later row depends on.
        This is the gateway checking its own output, which only proves self-consistency —{" "}
        <span className="font-mono text-slate-300">ledger/verify_chain.py</span>{" "}
        reimplements the rule independently from the schema, and that is the one to trust
        if the two ever disagree.
      </Callout>

      {error && <p className="text-xs text-rose-400">Last error: {error}</p>}
    </div>
  );
}
