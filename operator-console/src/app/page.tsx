import { Reveal } from "@/components/reveal";
import { Section } from "@/components/section";
import { stagger } from "@/lib/motion-tokens";
import { FleetPanel } from "@/components/panels/fleet-panel";
import { FeedPanel } from "@/components/panels/feed-panel";
import { PolicyPanel } from "@/components/panels/policy-panel";
import { CapsPanel } from "@/components/panels/caps-panel";
import { KillSwitchPanel } from "@/components/panels/killswitch-panel";
import { LedgerPanel } from "@/components/panels/ledger-panel";
import { LatencyPanel } from "@/components/panels/latency-panel";

const ACCENT = "#17C3A2";

// One continuous page. The order is the order an operator reads an incident in:
// what the fleet is doing, what it just tried, what the rules are, what the
// budgets are, how to stop it, what the record says, and what it cost in time.
export default function ConsolePage() {
  return (
    <div className="mx-auto max-w-[1200px] px-6">
      {/* Opening panel — sets the frame before any data appears. */}
      <section id="top" className="pt-20 pb-6 sm:pt-28">
        <Reveal>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#17C3A2]">
            Operator console
          </div>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-slate-50 sm:text-[3.4rem]">
            Every agent action, mediated and on the record.
          </h1>
          <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-slate-400">
            Scroll for the whole enforcement path: live fleet state, the decision stream,
            the policy actually in force, spend caps you can tighten mid-session, the
            fleet-wide stop, and the hash-chained ledger behind all of it.
          </p>
        </Reveal>

        <Reveal delay={stagger}>
          <dl className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-800/80 bg-slate-800/40 sm:grid-cols-3">
            {[
              ["3 checks", "Revocation, then policy, then spend cap — in that order"],
              ["0 side doors", "No agent path to a banking API that skips the gateway"],
              ["1 chain", "Allow, deny and operator action in one hash-linked ledger"],
            ].map(([stat, note]) => (
              <div key={stat} className="bg-[#070c16] px-5 py-6">
                <div
                  className="font-mono text-xl tracking-tight"
                  style={{ color: ACCENT }}
                >
                  {stat}
                </div>
                <div className="mt-2 text-[13px] leading-relaxed text-slate-500">
                  {note}
                </div>
              </div>
            ))}
          </dl>
        </Reveal>
      </section>

      <Section
        id="fleet"
        index="01"
        eyebrow="Fleet status"
        title="Three agents, live."
        lede="Status and spend for every registered agent, driven by the gateway's event stream rather than polling. Redis holds the counter the cap check reads; the ledger holds the exact record of what was allowed — each card reports whether the two still agree to the cent."
      >
        <FleetPanel />
      </Section>

      <Section
        id="feed"
        index="02"
        eyebrow="Live decision feed"
        title="Allow or deny, with the reason attached."
        lede="Every decision the gateway makes, appended to the ledger and pushed here as it happens. Denials carry the reason that produced them, and operator actions appear in the same stream — hitting the kill switch is recorded exactly like any agent request."
      >
        <FeedPanel />
      </Section>

      <Section
        id="policy"
        index="03"
        eyebrow="Policy in force"
        title="Nothing is permitted by default."
        lede="The role-to-action matrix OPA evaluates on every request, read live from the gateway. An action absent from a role's list is refused before any budget check runs."
      >
        <PolicyPanel />
      </Section>

      <Section
        id="caps"
        index="04"
        eyebrow="Spend caps"
        title="Tighten a budget mid-session."
        lede="Caps are enforced atomically in Redis, one round trip per request, so concurrent actions cannot race past a limit. Saving a new cap here changes what the very next request is allowed to do."
      >
        <CapsPanel />
      </Section>

      <Section
        id="stop"
        index="05"
        eyebrow="Emergency stop"
        title="One control halts everything."
        lede="Revoke a single agent or stop the entire fleet. Enforcement sits at the gateway, so a stopped agent does not have to cooperate — it keeps asking and keeps being refused."
      >
        <KillSwitchPanel />
      </Section>

      <Section
        id="ledger"
        index="06"
        eyebrow="Audit ledger"
        title="Tamper-evident by construction."
        lede="Each ledger row stores the hash of the row before it. Altering any historic row breaks its own hash and every link that follows, so tampering is detectable without trusting the database it lives in."
      >
        <LedgerPanel />
      </Section>

      <Section
        id="latency"
        index="07"
        eyebrow="Latency"
        title="Measured, not asserted."
        lede="Real round-trip timings for the calls this console makes, sampled live in the browser. Stated with its scope, because a latency number without one is just a claim."
        className="pb-32"
      >
        <LatencyPanel />
      </Section>
    </div>
  );
}
