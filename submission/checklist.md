# Round 1 Submission Checklist — AegisAgent

Maps every item in Amex's Round 1 guidelines to the exact file we upload. Nothing
listed here should be missing at submission time; gaps are called out explicitly
at the bottom, not glossed over.

## Solution Overview

| Guideline item | Covered by |
|---|---|
| Problem statement selected | `AegisAgent_Project_Description_new.docx` — header block + §2 |
| Proposed solution | `AegisAgent_Project_Description_new.docx` §1, §3 · `AegisAgent_Round1_Submission.pptx` slides 1–3 |
| Expected business or societal impact | `AegisAgent_Project_Description_new.docx` §9 · `AegisAgent_Round1_Submission.pptx` slide 11 |
| Success metrics | ⚠️ Partial — see gap note below |
| Implementation approach | `AegisAgent_Project_Description_new.docx` §10–11 · `implementation-guide.md` (supporting doc) |

## Technical Details

| Guideline item | Covered by |
|---|---|
| Technology stack | `AegisAgent_Project_Description_new.docx` §4 (table) · `AegisAgent_Round1_Submission.pptx` slide 4 |
| Frameworks | Same — FastAPI, OPA/Rego, Redis, PostgreSQL, Next.js named explicitly |
| Architecture diagram | `AegisAgent_Round1_Submission.pptx` slide 4 (box-and-arrow flow) |
| Flow charts | `AegisAgent_Project_Description_new.docx` §6 (numbered sequential steps) |
| Wireframes | ❌ Not included — see gap note below |
| Graphical representations | `AegisAgent_Round1_Submission.pptx` (cards, stat rows, timeline) + real screenshots |
| Assumptions and constraints | `AegisAgent_Project_Description_new.docx` §8 |
| Scalability considerations | `AegisAgent_Project_Description_new.docx` §8 (Scalability bullet) + §5.5 |

## Optional Supporting Assets

| Guideline item | Covered by |
|---|---|
| Prototype screenshots | `/demo-screenshots/01–05*.png` (5 files) · embedded in `AegisAgent_Round1_Submission.pptx` slide 10 |
| Demo images | Same 5 files |
| Screen recording | ✅ Recorded — `submission/demo video.mp4`, following `demo-video-script.md` |
| Video + hosted link | ⚠️ Video file is in the repo; **not yet hosted** — upload to YouTube/Loom and add the link to the submission form (or upload the file directly if the portal accepts it) |

## Full file list to upload

- [ ] `AegisAgent_Project_Description_new.docx`
- [ ] `AegisAgent_Round1_Submission.pptx`
- [ ] `demo-screenshots/01-normal-operation-wealth-hft-allowed.png`
- [ ] `demo-screenshots/02-rogue-agent-denied.png`
- [ ] `demo-screenshots/03-cap-tightened-next-request-denied.png`
- [ ] `demo-screenshots/04-emergency-stop-all-agents-halted.png`
- [ ] `demo-screenshots/05-audit-tamper-detected.png`
- [x] Demo video file — `submission/demo video.mp4` **or** hosted link (host it if the portal wants a URL)
- [ ] *(Recommended, optional)* Implementation Guide, as supporting detail behind §10/§11

## Before you hit submit

- [ ] Replace the `[Team Name]` placeholder in both the Project Description and the
      Pitch Deck cover slide — carried over as-is since the real team name wasn't
      given to this pass.
- [x] Record the ~90s video from `demo-video-script.md` — done, `submission/demo video.mp4`.
- [ ] Host the video (YouTube/Loom) and paste the link into the submission form, if the
      portal wants a URL rather than a direct file upload.
- [ ] Sanity-check the two documents open cleanly in real Word/PowerPoint on the
      machine that will actually submit them (built here with `python-docx` /
      `python-pptx`, not exported from the original design tool — verified to
      render correctly via PowerPoint itself, but worth one direct look before
      the deadline).

## Gaps — flagged, not hidden

- **Success metrics** aren't stated as a standalone, numbered target set inside
  the Project Description itself — they exist, but only in the Implementation
  Guide's QA & Performance Benchmarking table (100% policy accuracy, <5ms p95
  gateway overhead, <250ms kill-switch propagation, 0 adversarial breaches, 100%
  tamper detection). Recommend either pulling that table into the Project
  Description directly, or making sure the Implementation Guide is explicitly
  attached as a supporting doc so this isn't invisible to a judge who only opens
  the main description.
- **Wireframes** are not included as a separate artifact. Given the team already
  has a working, screenshotted product, real screenshots are arguably stronger
  evidence than low-fidelity wireframes — but the guideline names wireframes
  specifically, so if a judge checklist is scored literally rather than
  holistically, this line item reads as empty. Cheapest fix: a single
  labeled diagram-style wireframe of the operator console's 7 sections would
  satisfy the letter of the requirement in under 15 minutes, if wanted.
