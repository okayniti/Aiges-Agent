"use client";

// Every number on this panel is measured, not modelled.
//
// Each sample is one real gateway round-trip the console already had to make,
// timed with performance.now() on both ends in the browser. Because both
// timestamps come from the same clock, no skew between the host and the
// containers can distort it.
//
// What it is NOT: the "enforcement overhead" figure from the pitch deck. That
// claim is about time spent inside the gateway running the three checks. This
// measures the whole path — browser to Next route handler to gateway and back,
// including the ledger write and, for /audit, a full-chain verify. It is
// therefore an upper bound on enforcement cost, never a flattering one, and the
// panel says so rather than letting a reader assume the smaller number.

import { useGateway, type LatencySample } from "@/lib/gateway-store";
import { Callout, Panel, PanelHeader } from "@/components/section";

const ACCENT = "#17C3A2";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

type Group = { label: string; samples: number[] };

// Collapse per-agent mutations so the table describes endpoints rather than one
// row per agent touched, while leaving the reads and the fleet-scoped calls
// exactly as they are — those are genuinely different endpoints.
function normalizeLabel(label: string): string {
  if (label.startsWith("POST /agents/")) return "POST /agents/<id>/cap";
  const scoped = /^POST \/(revoke|restore) (.+)$/.exec(label);
  if (scoped) {
    return scoped[2] === "fleet"
      ? `POST /${scoped[1]} fleet`
      : `POST /${scoped[1]} <id>`;
  }
  return label;
}

function group(samples: LatencySample[]): Group[] {
  const byLabel = new Map<string, number[]>();
  for (const s of samples) {
    const label = normalizeLabel(s.label);
    const list = byLabel.get(label) ?? [];
    list.push(s.ms);
    byLabel.set(label, list);
  }
  return [...byLabel.entries()]
    .map(([label, samples]) => ({ label, samples }))
    .sort((a, b) => b.samples.length - a.samples.length);
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1.5 font-mono text-2xl tabular-nums text-slate-100">
        {value}
        {unit && <span className="ml-1 text-sm text-slate-500">{unit}</span>}
      </div>
    </div>
  );
}

export function LatencyPanel() {
  const { latency } = useGateway();

  const all = latency.map((s) => s.ms).sort((a, b) => a - b);
  const groups = group(latency);

  return (
    <div className="space-y-5">
      <Panel className="overflow-hidden">
        <PanelHeader
          title="Client-observed round-trip"
          meta={`${latency.length} sample${latency.length === 1 ? "" : "s"} this session`}
        />

        <div className="grid grid-cols-2 gap-6 px-6 py-6 sm:grid-cols-4">
          <Stat
            label="median"
            value={all.length ? percentile(all, 50).toFixed(0) : "—"}
            unit={all.length ? "ms" : undefined}
          />
          <Stat
            label="p90"
            value={all.length ? percentile(all, 90).toFixed(0) : "—"}
            unit={all.length ? "ms" : undefined}
          />
          <Stat
            label="fastest"
            value={all.length ? all[0].toFixed(0) : "—"}
            unit={all.length ? "ms" : undefined}
          />
          <Stat
            label="slowest"
            value={all.length ? all[all.length - 1].toFixed(0) : "—"}
            unit={all.length ? "ms" : undefined}
          />
        </div>

        {groups.length > 0 && (
          <div className="border-t border-slate-800/80">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60">
                  {["call", "n", "median", "p90", "slowest"].map((h, i) => (
                    <th
                      key={h}
                      className={
                        "px-5 py-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500 " +
                        (i === 0 ? "text-left" : "text-right")
                      }
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map(({ label, samples }) => {
                  const sorted = [...samples].sort((a, b) => a - b);
                  return (
                    <tr key={label} className="border-b border-slate-800/40 last:border-0">
                      <td className="px-5 py-3 font-mono text-[12px] text-slate-300">
                        {label}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-500">
                        {samples.length}
                      </td>
                      <td
                        className="px-5 py-3 text-right font-mono tabular-nums"
                        style={{ color: ACCENT }}
                      >
                        {percentile(sorted, 50).toFixed(0)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-300">
                        {percentile(sorted, 90).toFixed(0)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-500">
                        {sorted[sorted.length - 1].toFixed(0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {latency.length === 0 && (
          <div className="px-6 pb-6 text-sm text-slate-500">
            No samples yet — these populate as the console talks to the gateway.
          </div>
        )}
      </Panel>

      <Callout label="What this measures">
        Full browser-to-gateway-and-back time for calls the console was already making,
        timed on one clock in the browser. It is <em>not</em> the sub-10&nbsp;ms
        enforcement-overhead figure from the pitch: this path also crosses a Next route
        handler, writes the audit ledger, and for{" "}
        <span className="font-mono text-slate-300">GET /audit</span> re-verifies the entire
        hash chain. Treat it as a generous upper bound; isolating gateway-internal
        enforcement cost needs a server-side benchmark, which is Round&nbsp;2 work.
      </Callout>
    </div>
  );
}
