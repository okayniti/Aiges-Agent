"use client";

import { useRef, useState } from "react";
import gsap from "gsap";

import { setAgentCap } from "@/lib/api";
import { duration } from "@/lib/motion-tokens";
import { Button } from "@/components/ui/button";

const ACCENT = "#17C3A2";

// Edits one agent's spend cap. The POST goes to the same-origin route handler,
// which attaches the operator key server-side — the key never reaches here.
export function CapEditor({
  agentId,
  cap,
  onSaved,
}: {
  agentId: string;
  cap: string | null;
  onSaved: (newCap: string) => void;
}) {
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
      const result = await setAgentCap(agentId, n);
      onSaved(result.cap);
      setValue(result.cap);
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
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">cap</span>
        <span ref={capRef} className="font-mono tabular-nums">
          {cap === null ? "—" : Number(cap).toFixed(2)}
        </span>
        <input
          type="number"
          min="0"
          step="1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dirty && !saving) void save();
          }}
          className="h-7 w-28 rounded-md border border-input bg-input/30 px-2 text-sm font-mono outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={`new cap for ${agentId}`}
        />
        <Button size="sm" variant="outline" disabled={saving || !dirty} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
