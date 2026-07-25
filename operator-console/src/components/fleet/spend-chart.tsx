"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Agent } from "@/lib/api";

const ACCENT = "#17C3A2"; // teal, from the shared motion tokens
const REVOKED = "#f43f5e"; // rose-500
const REMAINING = "#334155"; // slate-700

type Row = {
  id: string;
  spent: number;
  remaining: number;
  cap: number | null;
  revoked: boolean;
};

function toRow(agent: Agent): Row {
  const spent = Number(agent.spent);
  const cap = agent.cap === null ? null : Number(agent.cap);
  return {
    id: agent.id,
    spent,
    remaining: cap === null ? 0 : Math.max(cap - spent, 0),
    cap,
    revoked: agent.revoked,
  };
}

// Spend vs. remaining budget per agent, updated live as the fleet state changes.
// Reads straight from the same agent state the cards use, so chart and cards can
// never disagree.
export function SpendChart({ agents }: { agents: Agent[] }) {
  const data = agents.map(toRow);

  return (
    <div style={{ width: "100%", height: Math.max(agents.length * 52, 120) }}>
      <ResponsiveContainer>
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
          barCategoryGap={12}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="id"
            width={92}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "rgba(148,163,184,0.08)" }}
            contentStyle={{
              background: "#0f1a2e",
              border: "1px solid #1e293b",
              borderRadius: 8,
              fontSize: 12,
              color: "#e2e8f0",
            }}
            formatter={(value, name) => [
              Number(value).toFixed(2),
              name === "spent" ? "Spent" : "Remaining",
            ]}
          />
          <Bar dataKey="spent" stackId="budget" radius={[4, 0, 0, 4]}>
            {data.map((row) => (
              <Cell key={row.id} fill={row.revoked ? REVOKED : ACCENT} />
            ))}
          </Bar>
          <Bar dataKey="remaining" stackId="budget" radius={[0, 4, 4, 0]} fill={REMAINING} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
