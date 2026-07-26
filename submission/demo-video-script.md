# AegisAgent — 90-Second Demo Video Script

**Format:** single-take screen recording, no edits required. Walks the exact 5-step
sequence from the Implementation Guide, against the real running stack
(`docker compose up` + `npm run dev`, per `docs/architecture.md`).

**Before recording:**
1. `cd infra && docker compose down -v && docker compose up -d --build` — clean boot.
2. `cd operator-console && npm run dev` — console at `http://localhost:3000`.
3. Have a terminal ready, pre-typed but not yet run:
   `python agents/fleet.py --duration 60`
4. Browser at `http://localhost:3000`, scrolled to `#top`, window sized so the
   sticky header (with **Kill fleet**) is always visible.

Every beat below matches a real, already-tested screenshot in `/demo-screenshots` —
this script doesn't invent a new sequence, it's the one already proven to work twice
in a row from a clean boot.

---

| Time | Screen / action | Narration (read aloud) |
|---|---|---|
| **0:00–0:08** | Cover: console at `#top`, hero stat row visible (`3 checks · 0 side doors · 1 chain`) | "AegisAgent — the governance layer between every autonomous financial agent and a real banking API. This is the actual system running, not a mockup." |
| **0:08–0:25** | Run `python agents/fleet.py --duration 60` in the terminal. Scroll to **`#fleet`**. Let ~4s of real traffic accrue, spend bars visibly ticking. *(→ `01-normal-operation-wealth-hft-allowed.png`)* | "Three agents, live. Wealth Advisory and our High-Frequency Trader are both executing allowed actions right now — spend tracked against budget in real time, Redis and the ledger agreeing to the cent." |
| **0:25–0:40** | Scroll to **`#feed`**. Point at a `rogue-001` row with `DENY action_not_permitted`. *(→ `02-rogue-agent-denied.png`)* | "Our third agent is deliberately rogue — it has zero permitted actions. Watch it attempt a transfer, live — instantly denied, with the exact policy reason attached. Nothing is allowed by default." |
| **0:40–0:55** | Scroll to **`#caps`**. Type `1` into the HFT cap input, click **Save**. Scroll back to **`#feed`** to show the `cap_change` row followed by cascading `DENY cap_exceeded`. *(→ `03-cap-tightened-next-request-denied.png`)* | "Now, mid-session, I tighten the trader's spend cap from five thousand to one dollar — no restart. The very next request it makes is refused under the new limit, immediately." |
| **0:55–1:10** | Scroll to **`#stop`**. Click **Kill fleet**. Hold on all three agents flipping to `REVOKED` simultaneously. *(→ `04-emergency-stop-all-agents-halted.png`)* | "One control halts everything. Every agent — compliant or not — is refused on its very next request. No per-agent shutdown script, no polling delay: the gateway is the chokepoint." |
| **1:10–1:25** | Switch to terminal: `docker exec infra-postgres-1 psql -U postgres -d aegis -c "UPDATE audit_log SET amount = 424242.42 WHERE id = 1"`. Back to browser, scroll to **`#ledger`**, click **Re-verify chain**. *(→ `05-audit-tamper-detected.png`)* | "Every decision lives in a hash-chained ledger. I'll edit a historic row directly in the database — and re-verify. Caught instantly: chain tampered, breaks at row one." |
| **1:25–1:30** | Hold on the closing business-value line, or cut to a title card with it in teal. | "AegisAgent doesn't compete with the other challenge tracks — it's the infrastructure every one of them needs before it can go live." |

---

## Notes for the recording operator

- **Steps 2 and 3 both read off the same `#feed` panel** — no need to re-navigate
  between them if the timing is tight; just let the feed keep streaming.
- **The rogue agent's first denial may already be in view** by the time you reach
  `#feed` (it fires every 1.2s) — don't wait for a fresh one, point at whichever is
  newest.
- **Cap editor input is per-agent** (`aria-label="new cap for hft-001"` /
  `"save cap for hft-001"`) — there are three identical-looking Save buttons on the
  page; confirm you're editing the HFT card before recording, not Wealth or Rogue.
- **Restore the fleet after 0:55–1:10** if continuing to record past this script
  (click **Restore fleet**) — not required for this 90-second cut, since it ends
  before returning to `#fleet`.
- If a retake is needed, reset from zero first (`docker compose down -v && up -d
  --build`) so the ledger, spend, and cap state are all clean — this is exactly the
  reset step used both times this sequence was verified live during development.
