# NEAR AI Cloud — Research Findings for AegisAgent (CodeStreet 2026)

Research date: 2026-07-21. Method: direct retrieval of docs.near.ai, near.ai, cloud.near.ai,
docs.ironclaw.com, and the `nearai` GitHub org (public repos, READMEs, `/v1/models` API) — no
speculation beyond what these sources state. Every claim below is tagged and sourced.

---

## 0. Two products, not one — read this first

NEAR AI ships **two separate things** that are easy to conflate:

1. **NEAR AI Cloud** (`cloud.near.ai` / `docs.near.ai`) — a hosted, OpenAI-compatible **LLM
   inference API**. A curated set of open-weight models (GLM, Qwen, gpt-oss, DeepSeek, Gemma,
   Kimi) run on NEAR's own GPU fleet *inside TEEs*, with attestation and response-signing
   available. Third-party models (OpenAI, Anthropic, Gemini) are also proxied through it but are
   **explicitly not TEE-protected** ("Anonymized, not TEE-protected" — per the live `/v1/models`
   response for `anthropic/claude-sonnet-4-5`).
   **CONFIRMED** — [docs.near.ai/cloud/introduction](https://docs.near.ai/cloud/introduction), [docs.near.ai/cloud/models](https://docs.near.ai/cloud/models), `https://cloud-api.near.ai/v1/models`

2. **IronClaw** (`docs.ironclaw.com`, [github.com/nearai/ironclaw](https://github.com/nearai/ironclaw)) — NEAR AI's
   open-source Rust **agent framework** (channels, tools, memory, cron jobs — a general agent
   runtime, not finance-specific). It is installed on a VM you control (or a plain SSH'd
   "private instance" from `agent.near.ai`) and can *optionally* point its LLM calls at NEAR AI
   Cloud.
   **CONFIRMED** — [docs.ironclaw.com](https://docs.ironclaw.com/index.md)

**The distinction matters a lot for your requirement.** Only #1 is documented as running inside a
TEE with attestation. #2 (the actual agent process — its state, orchestration logic, tool calls)
is **not** documented as TEE-hosted anywhere in the IronClaw docs — see §2.

---

## 1. Developer / sandbox access today

**CONFIRMED.** Per the Quickstart:

1. Sign up at [cloud.near.ai](https://cloud.near.ai)
2. Go to "Credits" and purchase credits (pay-as-you-go)
3. Go to "API Keys" and generate a key

Source: [docs.near.ai/cloud/quickstart](https://docs.near.ai/cloud/quickstart)

No waitlist is mentioned anywhere in the docs or marketing site. NEAR AI Cloud is explicitly
labeled **"Beta"** on its own introduction page ("NEAR AI Cloud is currently in beta. We're
shipping new capabilities every week") — [docs.near.ai/cloud/introduction](https://docs.near.ai/cloud/introduction).

**UNVERIFIED:**
- Whether there is a free/trial credit grant on signup (amount, if any) — not stated in the docs
  I could reach; the Quickstart just says "purchase credits."
- Any hackathon-specific credit program. I searched specifically for a NEAR AI × American Express
  CodeStreet 2026 partnership and found **no evidence of one** — CodeStreet 2026 (registration
  Jul 13–27, prototype/mentoring Aug 7–21, finale Aug 25, per HackerEarth) does not list NEAR AI
  as a sponsor or partner in anything I could find. Budget for real, paid credits, not a
  sponsored allocation.

IronClaw itself has a separate, free "click-to-install" path via **agent.near.ai** (SSH into a
private instance) with no credits/billing mentioned for that layer — [docs.ironclaw.com/quickstart](https://docs.ironclaw.com/quickstart.md).

---

## 2. Mechanism for deploying an agent inside a TEE

**PARTIALLY CONFIRMED — and the "partial" part is the important finding.**

**What is confirmed to run inside a TEE:** NEAR AI Cloud's own inference nodes. Architecture, per
docs: Intel TDX Confidential VMs + NVIDIA GPU TEE, hardware run by NEAR AI, orchestrated by an
internal component called the **Private-ML-SDK** ([github.com/nearai/private-ml-sdk](https://github.com/nearai/private-ml-sdk),
description: *"Run LLMs and agents on TEEs leveraging NVIDIA GPU TEE and Intel TDX technologies"*).
This SDK builds TDX guest images and launches Confidential VMs via a `dstack`-based toolchain —
but it is infrastructure NEAR AI runs to host **its own** pre-selected models, not a documented
self-serve "upload your container, get a TEE" product for external developers. There is no
`docs.near.ai` page describing how a third party deploys arbitrary application code (e.g., your
own agent business logic) into one of these CVMs. The only public entry points to NEAR AI's TEEs
are the fixed inference API endpoints (`cloud-api.near.ai`, `{slug}.completions.near.ai`).
Source: [github.com/nearai/private-ml-sdk](https://github.com/nearai/private-ml-sdk), [docs.near.ai/cloud/private-inference](https://docs.near.ai/cloud/private-inference)

**What is NOT confirmed to run inside a TEE:** the IronClaw agent process itself. Its own docs
show it being installed via a shell installer or SSH'd into, on:
- A plain EC2 `t2.micro`/`t3.micro` Ubuntu instance — [docs.ironclaw.com/infrastructure/amazon](https://docs.ironclaw.com/infrastructure/amazon.md)
- A DigitalOcean Droplet — [docs.ironclaw.com/infrastructure/droplet](https://docs.ironclaw.com/infrastructure/droplet.md)
- A Google Compute Engine VM — [docs.ironclaw.com/infrastructure/google](https://docs.ironclaw.com/infrastructure/google.md)
- A generic SSH'd "private instance" from `agent.near.ai` — [docs.ironclaw.com/quickstart](https://docs.ironclaw.com/quickstart.md)

None of these four setup guides mention TDX, TEEs, confidential VMs, or attestation for the
IronClaw instance itself. IronClaw's own [Security page](https://docs.ironclaw.com/security.md)
describes its protection model as **software-level defense-in-depth** — WASM/Docker sandboxing,
secret-leak scanning, network allowlisting, prompt-injection filtering — not hardware attestation.
The only TEE relationship IronClaw has is that it *recommends* NEAR AI Cloud as its LLM
**inference provider** ("We recommend using NEAR AI as your inference provider for maximum
privacy and security" — [docs.ironclaw.com/onboard](https://docs.ironclaw.com/onboard.md)), i.e.
the agent's *model calls* can be TEE-attested, but the agent's own runtime, memory, and tool
execution are not.

This directly contradicts the framing on the NEAR AI marketing homepage, which states IronClaw
"runs inside a Trusted Execution Environment. Nothing leaks out." — [near.ai](https://www.near.ai/). I could not
find that claim substantiated anywhere in the actual IronClaw or NEAR AI Cloud technical docs. I'm
flagging this explicitly as a marketing/documentation discrepancy rather than resolving it in
either direction.

**Bottom line for your requirement** ("3 autonomous financial agents inside attested,
hardware-secured TEE environments"): as publicly documented today, you can get TEE attestation
for the **LLM inference calls** your agents make, but not for the **agent process/orchestration
layer** itself, without doing custom low-level engineering against `private-ml-sdk`/`dstack`
(building your own TDX guest image, standing up a Local KMS, needing actual TDX+GPU-TEE
hardware) — a multi-day systems project, not a documented quickstart.

---

## 3. What attestation concretely returns

**CONFIRMED**, with a real example from the docs.

Endpoint: `GET /v1/attestation/report?model={model}&signing_algo=ecdsa&nonce={nonce}` (via
gateway `cloud-api.near.ai`) or `GET {slug}.completions.near.ai/v1/attestation/report?...` (direct).
Source: [docs.near.ai/cloud/verification/model](https://docs.near.ai/cloud/verification/model)

It returns **signed JSON**, not a certificate file and not (per the technical docs) an on-chain
record:

```json
{
  "model_attestations": [
    {
      "signing_address": "...",   // TEE-generated public key used to sign chat responses
      "nvidia_payload": "...",    // GPU attestation evidence, verified against NVIDIA NRAS
      "intel_quote": "..."        // Intel TDX quote, verified against Intel DCAP collateral
    }
  ]
}
```

With `include_tls_fingerprint=true` (direct completions only), the attested `report_data` also
binds the live TLS certificate: `report_data[0:32] = SHA256(signing_address || tls_cert_fingerprint)`,
`report_data[32:64] = nonce`. This lets you prove your HTTPS connection terminates *inside* the
TEE, not just that a TEE exists somewhere. Source: [docs.near.ai/cloud/verification/tls](https://docs.near.ai/cloud/verification/tls)

Verification is a 3-step client-side process, fully documented with runnable Python:
1. Submit `nvidia_payload` to NVIDIA's Remote Attestation Service (`https://nras.attestation.nvidia.com/v3/attest/gpu`) → returns a JWT (EAT) confirming genuine H100/H200 hardware.
2. Verify `intel_quote` with the `dcap-qvl` library against Intel DCAP collateral → confirms genuine TDX CPU.
3. Compare `mr_config_id` from the verified quote against `SHA256(app_compose)` (the Docker Compose manifest, cross-referenced against the public [nearai/cvm-compose-files](https://github.com/nearai/cvm-compose-files) repo) → proves *which exact code* is running.

Individual chat messages can also be verified via signed request/response hashes
(`signature_kind: provider_tee` or `gateway`) — [docs.near.ai/cloud/verification/chat](https://docs.near.ai/cloud/verification/chat).

**On the "on-chain record" question specifically:** the near.ai marketing homepage says NEAR AI
is built on "TEEs and blockchain verification," but nothing in the actual verification docs
(`docs.near.ai/cloud/verification/*`) describes writing attestation reports to a blockchain — the
entire verification flow is off-chain: signed reports checked against NVIDIA's and Intel's
attestation services and a public GitHub repo of compose manifests. **UNVERIFIED / likely
marketing overstatement** — I found no on-chain attestation schema anywhere in the technical docs.

---

## 4. Python/JS SDK for a FastAPI backend

**Split answer — deploy: no; verify: yes, but not a clean installable package.**

**(a) Deploy an agent — UNVERIFIED / not found.** No `pip install`/`npm install` package or REST
API exists (in the docs I could reach) for programmatically deploying agent code into a NEAR AI
TEE from a backend service. IronClaw's own OpenAPI spec ([docs.ironclaw.com/api-reference/openapi.json](https://docs.ironclaw.com/api-reference/openapi.json))
describes IronClaw's *runtime* HTTP API (its webhook channel) once it's already running on a
VM — it is not a deployment/provisioning API. Deploying IronClaw is a shell-installer + SSH
workflow (§2), not something you'd call from FastAPI.

**(b) Verify an attestation proof — CONFIRMED, exists, but ships as source, not a package.**
[github.com/nearai/nearai-cloud-verifier](https://github.com/nearai/nearai-cloud-verifier) — "Python and TypeScript tools for
validating NEAR AI Cloud attestation reports and response signatures."
- Python: `git clone` + `pip install -r requirements.txt` (deps: `requests`, `eth-account`,
  `dcap-qvl`, `cryptography` — all of which **are** real, independently installable PyPI
  packages; I confirmed `dcap-qvl` exists on PyPI). Scripts: `py/model_verifier.py`,
  `py/chat_verifier.py`, `py/encrypted_chat_verifier.py`. These are plain Python functions you
  can import into a FastAPI service, not a published `pip install nearai-cloud-verifier` package
  — **there is no such package on PyPI** (confirmed 404).
- TypeScript: `pnpm install`, deps `ethers`, `dcap-qvl-node`, `tsx`. Caveat:
  **`dcap-qvl-node` does not appear on the public npm registry** (confirmed 404) — the repo's
  own stated TS dependency isn't publicly resolvable, which would block a from-scratch JS
  integration unless it's a private/workspace-local package I couldn't see.
- There is a package literally named `nearai-cloud-verifier` on npm, but it's
  **`0.0.1-alpha.1`**, published by an individual maintainer account, with no repository/homepage
  metadata attached — I cannot confirm it's officially maintained by the `nearai` org. Treat it
  as unverified; use the GitHub source directly instead.

Practical implication: a FastAPI backend can vendor the Python verifier scripts from the GitHub
repo (real, working, documented with runnable examples in §3) to check attestation on responses
from the 3 agents' LLM calls. There is no equivalent SDK for the "deploy inside a TEE" half of
the requirement.

---

## 5. Latency / cost for 3 lightweight agents in a live demo

**Cost: CONFIRMED, and cheap.** Live pricing pulled from the public, unauthenticated
`https://cloud-api.near.ai/v1/models` endpoint (per-million-token, in this beta the field is
literally `pricing.input`/`pricing.output` in USD per 1M tokens):

| Model (TEE-hosted, `is_ready: true`) | Input $/M | Output $/M |
|---|---|---|
| `openai/gpt-oss-120b` | $0.15 | $0.55 |
| `Qwen/Qwen3.6-35B-A3B-FP8` | $0.17 | $1.10 |
| `Qwen/Qwen3.6-27B-FP8` | $0.325 | $3.25 |
| `Qwen/Qwen3.5-122B-A10B` | $0.40 | $3.20 |
| `zai-org/GLM-5.1-FP8` | $1.40 | $4.40 |

For 3 lightweight demo agents doing occasional reasoning calls (not high-throughput trading),
total token spend for a demo day is very plausibly **under $5**, assuming you buy at least the
minimum credit purchase. **UNVERIFIED:** the minimum credit purchase amount and accepted payment
methods aren't stated in the docs I could reach — check the dashboard directly before assuming a
$5–$10 top-up is possible.

**Latency: PARTIALLY CONFIRMED, one concrete data point + one marketing claim.**
- Concrete, documented data point: full client-side attestation verification (NVIDIA NRAS round
  trip + Intel DCAP quote verification) **"takes several seconds"** per request, which is why the
  docs explicitly recommend caching the verified SPKI hash and only re-verifying on a ~24h TTL or
  when it changes, rather than on every call — [docs.near.ai/cloud/verification/tls](https://docs.near.ai/cloud/verification/tls).
  For a live demo, doing full attestation once per agent at startup (cached) rather than per
  request is the only way to keep interactive latency reasonable.
- Marketing claim only, no benchmark numbers published: "Hardware-accelerated TEEs... deliver
  high-throughput inference with minimal latency overhead" — [docs.near.ai/cloud/private-inference](https://docs.near.ai/cloud/private-inference).
  No actual ms/token or time-to-first-token figures were published anywhere I could reach.
  **UNVERIFIED** as a number you can put in a demo deck.
- Architecturally favorable point that is confirmed: **direct completions** endpoints
  (`{slug}.completions.near.ai`) skip the gateway hop and connect straight to the model's TEE,
  and only require model-level (not gateway-level) verification — genuinely lower latency and a
  simpler trust chain than going through `cloud-api.near.ai` — [docs.near.ai/cloud/quickstart](https://docs.near.ai/cloud/quickstart).

---

## Recommendation

Real NEAR AI Cloud is feasible to integrate by Day 2–3 **for the LLM-inference layer only**: sign
up, buy credits, hit an OpenAI-compatible endpoint, and pull back a genuine, independently
verifiable TEE attestation (§3) using the real Python verifier scripts from
`nearai/nearai-cloud-verifier` (§4) — this part is well-documented, cheap (§5), and would be a
legitimate, demoable "real TEE" claim for the 3 agents' model calls. What is **not** feasible by
Day 2–3, and isn't a documented self-serve product at all today, is running the agents'
orchestration/business logic itself inside a TEE — that would mean building custom TDX guest
images against `private-ml-sdk`/`dstack` from scratch, which needs TDX+GPU-TEE hardware access
and is a systems-infra project, not a hackathon integration. Given that, I'd build the 3 agents
against real NEAR AI Cloud for attested inference calls, and pair it with a **mocked
attestation interface at the agent-process level**, explicitly labeled in the submission as
"structurally identical, sandbox-swappable" for the piece NEAR AI Cloud doesn't publicly expose —
that's an honest description of what's real vs. simulated, and it avoids repeating the
unsubstantiated "the whole agent runs in a TEE" claim from NEAR AI's own marketing copy, which
their technical docs don't back up.
