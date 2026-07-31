# Codex Feature Specification — Branch `feature-polish`

## Mission

Implement the "snowball marketplace" feature set on the branch `feature-polish` (created
from the completed `30-jul-night` fix branch). These features convert Veltact from a
single-transaction demo into a compounding platform: every engagement leaves behind a
per-account supplier registry entry, live agentic discovery finds real suppliers with
cited evidence, Pinch funds the entire delivery lifecycle milestone by milestone, and
the product's speed claim becomes a visible, timestamped artifact.

This is an OVERNIGHT AUTONOMOUS RUN. Follow the run protocol exactly.

## Run protocol (read first)

1. Work only on `feature-polish`. Confirm you are on it before the first edit.
2. Implement features in the order F1 → F6. They are ordered by judging value; if time
   or reliability forces triage, a finished F1–F3 beats a half-finished F1–F6.
3. One commit (or small series) per feature. EVERY commit leaves
   `npm test && npm run typecheck && npm run build` green. Never commit red.
4. If a feature is blocked (external API surprises, missing docs), implement its
   keyless/fixture form, mark the live path with a clear TODO, record it in the run
   report, and move on. Do not burn hours on one integration.
5. **Zero-credential rule:** every feature must build, test and demo with NO API keys
   present, using the existing provider-mode pattern (fixture / local_demo vs live).
   Live keys only ever enrich behaviour. Tests use fixtures and mocked HTTP — never
   call external paid APIs from the test suite.
6. Never commit secrets. `apps/api/.env` stays untracked. New env vars get documented
   in `apps/api/.env.example` (placeholder values only) and in the run report.
7. Truthfulness invariants are non-negotiable and extend to new features: live evidence
   labelled live with source URLs; fixture evidence labelled fixture; discovered
   suppliers are CANDIDATES until they consent by responding (PRODUCT.md excludes
   autonomous enrolment from scraped data); payment states change only on verified
   backend evidence.
8. When finished (or at forced stop), write `CODEX_RUN_REPORT.md` at repo root:
   per-feature status (done / partial / skipped + why), new env vars, new endpoints,
   test count before/after, and exact manual steps for the morning smoke test. Commit it.

---

# F1 — Per-account Supplier Registry (the snowball core)

**Concept.** Each buyer account/workspace accumulates a private registry of every
supplier it has ever discovered, contacted, or worked with, with a provenance ladder:
`discovered → contacted → responded → secured → delivered`. The registry starts empty
and is built as a side effect of the normal workflow — no separate data entry.

**Build.**
1. Schema in `packages/contracts`: `SupplierRegistryEntry` — supplier identity (name,
   normalised domain, location, capabilities), provenance state, source
   (`catalog | live_discovery | fixture`), evidence citations (URL + retrieved-at for
   discovered entries), engagement history (needId, engagementId, response price,
   secured flag, delivered flag, timestamps), and per-account scoping key. Version it
   like the existing contracts.
2. Persistence: extend the existing marketplace store/persistence
   (`apps/api/src/marketplace/store.ts`, `persistence.ts`) with a registry collection
   keyed by account/workspace. Reuse the snapshot mechanism (`.data/marketplace.json`).
3. Write-through hooks (side effects, no new user actions):
   - candidate matching produces entries at `discovered` (with source + citations),
   - outreach send → `contacted`,
   - supplier response → `responded` (store indicative price),
   - authoritative Pinch payment → `secured`,
   - deployment completion (all milestones done) → `delivered`.
   Idempotent: re-running a stage upgrades state monotonically, never duplicates.
   Dedup by normalised domain, else normalised name + location.
4. API: `GET /api/registry` (account-scoped, respects the existing buyer capability
   token model) returning entries + summary counts per state.
5. Buyer UI: a "Your suppliers" view reachable from the workspace header
   (`apps/buyer/src/main.ts`): table of entries with provenance badge, source label,
   capability chips, engagement count, last activity; empty state copy that sells the
   concept ("Your supplier bench builds itself as you use Veltact"). Read-only this
   round. Follow existing card/table styles and a11y patterns (this view must also get
   the focus-on-heading behaviour from the fix spec).

**Acceptance.** Running the full canonical flow (fixture mode) leaves ≥3 registry
entries, with the selected supplier at `secured` and the others at `responded`/
`contacted`; states survive API restart; a second requirement with the same suppliers
upgrades/reuses entries instead of duplicating. Unit tests for dedup, monotonic state,
and the write-through hooks.

# F2 — Live Agentic Supplier Discovery (activate + extend what exists)

**Concept.** With keys present, "Find suppliers" performs real web discovery and returns
real companies with cited source URLs, merged with catalog/registry suppliers. Keyless,
it behaves exactly as today (fixtures, labelled).

**Build.**
1. The live path already exists: OpenAI web_search research + supplier discovery with
   Firecrawl fallback in `apps/api/src/marketplace/findProviders.ts` (provider selection
   via `shouldUseFixture()` ~line 407, env in `apps/api/src/env.ts`). Wire the same
   provider-mode pattern into the canonical marketplace matching so live-discovered
   candidates flow into the SAME explainable-match pipeline and candidate cards as
   catalog suppliers, with source mode `live_discovery`, per-candidate citation list
   (URL, title, retrieved-at) rendered under "why this supplier" via the existing
   progressive-disclosure pattern.
2. Add a discovery provider abstraction with two implementations: `openai_web_search`
   (default, exists) and `perplexity` (optional, `PERPLEXITY_API_KEY`, sonar model —
   implement as a thin adapter with the same output contract; if the API shape fights
   you, ship openai-only and note it in the run report). Selection via
   `VELTACT_DISCOVERY_PROVIDER=auto|openai|perplexity|fixture` following the existing
   research-provider convention.
3. Registry integration: discovered candidates write F1 registry entries at
   `discovered`; when a requirement starts, registry suppliers whose capabilities match
   are injected as candidates ranked ABOVE cold discoveries, with an explicit match
   reason ("In your supplier bench: responded to 1 previous requirement").
4. Consent boundary: discovered entries display "Public evidence produced this
   candidate — not a verified or enrolled supplier" (existing copy pattern). Outreach to
   discovered suppliers uses the existing invitation flow unchanged.
5. Guardrails: cap discovery at ~8 candidates/run; 20s overall budget with graceful
   partial results; sanitise/validate all model-returned URLs (http(s) only); no
   scraping behind logins; store retrieved-at timestamps.

**Acceptance.** Keyless: behaviour identical to today (fixture labels intact) — the full
existing test suite passes untouched. With `OPENAI_API_KEY` in `.env` (manual morning
smoke, not CI): a novel typed requirement yields candidates whose names/URLs did not
exist in any fixture or catalog file, each with ≥1 citation, all labelled live
discovery, and registry entries created. Unit tests mock the provider HTTP layer and
assert contract mapping, capping, URL validation, and registry write-through.

# F3 — Agent Activity Timeline (make "agentic" visible)

**Concept.** While research/discovery runs, the buyer sees a live-updating timeline of
what the agent is doing; afterwards it collapses into the provenance record.

**Build.**
1. Backend: emit structured progress events from the research/discovery pipeline
   (`findProviders.ts` stages: query formulation, sources read, candidates considered,
   accepted/rejected + one-line reason). Deliver over the existing Socket.IO channel
   (`apps/api/src/marketplace/realtime*`) scoped to the workspace, and persist the final
   event list on the research/discovery result for replay after refresh.
2. Fixture mode emits the same event shapes deterministically (a few staged events with
   realistic-but-labelled content) so the demo works keyless — events carry the source
   mode and the UI shows the existing fixture badge.
3. Buyer UI: timeline panel on the plan/candidates views — icon, timestamped line,
   collapsible detail; `aria-live="polite"`; appears while `loadState` is pending and
   remains as a collapsed "How these were found" disclosure afterwards.

**Acceptance.** Fixture run shows ≥4 timeline events live-streaming during analysis and
a persistent collapsed trail after; refresh replays the trail from the stored result;
live run (morning smoke) shows genuine URLs in read events. Tests: event emission order
(API), rendering + replay (buyer).

# F4 — Milestone Funding via Pinch (payment as the rail, not the receipt)

**Concept.** The initial commitment is milestone 1 of a funded delivery plan. Each
subsequent milestone gets its own Pinch payment link when the buyer releases it; the
deployment tracker shows funded vs unfunded milestones with authoritative evidence per
milestone; a disclosed Veltact service fee rides in the payment metadata.

**Build.**
1. Extend the commitment machinery (`apps/api/src/payments/commitmentPaymentService.ts`,
   `apps/api/src/marketplace/store.ts` deployment/milestone structures) so a milestone
   beyond the first can move `unfunded → payment_pending → funded(authoritative)` using
   the SAME create-link / webhook / reconciliation paths (full commitment metadata per
   the 30-jul-night fixes, plus `milestoneId`). Route:
   `POST /api/engagements/:engagementId/milestones/:milestoneId/payment-link`, buyer
   capability-gated; only the next incomplete milestone can be funded (no skipping).
2. Service fee: add `serviceFeeMinor` + `serviceFeeDisclosed: true` to payment-link
   metadata (flat 5% of milestone amount, configurable `VELTACT_SERVICE_FEE_BPS`
   default 500) and display "Includes disclosed Veltact service fee: $X" on the payment
   panel. Per PRODUCT.md: do NOT claim a commission was collected — metadata + display
   only.
3. Cancellation/refund: consult https://docs.getpinch.com.au for the sandbox refund /
   payment-void surface. If workable within ~2 hours: `POST .../milestones/:id/refund`
   creating a Pinch refund whose completion is verified via webhook/reconciliation
   before the milestone reverts (evidence recorded, truthful pending state meanwhile).
   Otherwise: implement buyer-initiated CANCELLATION of an UNPAID pending milestone link
   only (never fabricate refund evidence), and record the refund path as TODO in the run
   report.
4. Deploy view (`apps/buyer/src/main.ts` deployment rendering): milestone list with
   funding state chips, per-milestone evidence (reusing the Fix 2.5 evidence panel),
   one primary action = fund next milestone. Local-demo provider keeps working with its
   existing non-authoritative labels.

**Acceptance.** Sandbox (morning smoke): funding milestone 2 creates a real second Pinch
link carrying milestone + fee metadata; webhook/reconciliation marks it funded with
per-milestone evidence displayed. Keyless/local-demo: full flow with non-authoritative
labels. Tests (mocked Pinch client): sequential-funding guard, metadata completeness
incl. fee, evidence recording per milestone, no state change on unverified events.

# F5 — Speed Receipt (the pitch in one artifact)

**Concept.** Every engagement renders a timestamped trail proving the core claim:
problem → secured supplier in minutes.

**Build.**
1. The store already timestamps the lifecycle; add an ordered
   `GET /api/engagements/:id/receipt` assembling: requirement created, analysis done,
   outreach sent (+ channel), each response received, supplier selected, payment link
   created, payment verified (evidence source), each milestone funded. Include total
   elapsed (creation → secured) and a static baseline line "Industry norm: days to
   weeks" (labelled as a general claim, no fabricated statistic).
2. Buyer UI: "Speed receipt" card on selected/payment/deployment views — vertical
   timeline, elapsed-time headline ("Secured in 9m 41s"), print-friendly CSS
   (`@media print`) so it exports as the shareable artifact. Pending steps render as
   pending — the receipt must be truthful mid-flow too.

**Acceptance.** After the canonical fixture flow, the receipt shows every step with real
recorded timestamps and a correct elapsed headline; unpaid engagements show payment
pending truthfully; printing yields one clean page. Tests: receipt assembly ordering +
elapsed computation (API), rendering (buyer).

# F6 (stretch) — Registry-aware recommendation boost

Only if F1–F5 are done and green. When ranking candidates, add a bounded score boost
from registry history (responded before: small; secured before: medium; delivered:
large), surfaced as an explainable match reason ("Delivered for you before — 1
engagement completed"). Deterministic, unit-tested, never overrides capability mismatch
(a wrong-capability supplier cannot outrank a right-capability one on history alone).

---

# Environment variables (document all in `.env.example`; never commit real values)

| Var | Feature | Default behaviour without it |
|---|---|---|
| `OPENAI_API_KEY` | F2/F3 live research+discovery | fixture mode (labelled) |
| `VELTACT_DISCOVERY_PROVIDER` | F2 | `auto` |
| `PERPLEXITY_API_KEY` | F2 optional provider | openai or fixture |
| `VELTACT_SERVICE_FEE_BPS` | F4 | `500` |
| (existing Pinch vars) | F4 | local_demo provider labels |

# Final verification before stopping

1. `npm test && npm run typecheck && npm run build` green; test count strictly above
   the `30-jul-night` baseline.
2. Keyless canonical flow: registry populates (F1), fixture timeline streams (F3),
   local-demo milestone funding labelled non-authoritative (F4), receipt renders (F5).
3. Demo buttons and `npm run demo:reset` (both scenarios) unchanged and working.
4. `CODEX_RUN_REPORT.md` written and committed, including the exact morning smoke
   checklist for live keys (OpenAI discovery run + Pinch sandbox milestone funding).
5. All work committed on `feature-polish`. Do not create further branches. STOP.
