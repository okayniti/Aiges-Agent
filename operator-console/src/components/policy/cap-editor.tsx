"use client";

import { useRef, useState } from "react";
import gsap from "gsap";

import { duration } from "@/lib/motion-tokens";
import { useGateway } from "@/lib/gateway-store";
import { Button } from "@/components/ui/button";

const ACCENT = "#17C3A2";

// Edits one agent's spend cap. The write goes through the shared store, which
// POSTs to the same-origin route handler; that handler attaches the operator key
// server-side, so the key never reaches this component.
export function CapEditor({ agentId, cap }: { agentId: string; cap: string | null }) {
  const { saveCap } = useGateway();
  const [value, setValue] = useState(cap ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capRef = useRef<HTMLSpanElement>(null);

  const dirty = value.trim() !== (cap ?? "");

  async function save() {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      setError("cap must be a number greater than 0");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveCap(agentId, n);
      setValue(saved);
      if (capRef.current) {
        gsap.fromTo(
          capRef.current,
          { color: ACCENT },
          { color: "inherit", duration: duration.slow, ease: "power1.out" },
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "cap update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
          Current cap
        </span>
        <span ref={capRef} className="font-mono text-lg tabular-nums text-slate-100">
          {cap === null ? "—" : Number(cap).toFixed(2)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="0"
          step="1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dirty && !saving) void save();
          }}
          className="h-8 w-full rounded-md border border-slate-700 bg-slate-900/60 px-2.5 font-mono text-sm text-slate-100 outline-none focus-visible:border-[#17C3A2] focus-visible:ring-2 focus-visible:ring-[#17C3A2]/30"
          aria-label={`new cap for ${agentId}`}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={saving || !dirty}
          onClick={save}
          // The page carries one of these per agent, so the visible label alone
          // is ambiguous to a screen reader (and to a test).
          aria-label={`save cap for ${agentId}`}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
