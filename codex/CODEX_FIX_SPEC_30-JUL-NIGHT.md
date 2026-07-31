# Codex Fix Specification — Branch `30-jul-night`

## Mission

Execute every fix in this document, in order, on a branch named exactly `30-jul-night`.
These fixes come from a full live assessment of the application (buyer workflow walked
end-to-end, supplier flow exercised, real Pinch sandbox payment link created, code
audited). They close the gap between "scripted demo" and "product a judge can poke
freely" for the hackathon judging criteria: Innovation, Problem Solving, Technical
Execution, User Experience, Commercial Potential, and Effective Use of the Pinch API.

## Branch and completion protocol (read first, follow exactly)

1. Start from the current branch `codex/landing-page-factory-diorama` and create the
   working branch:
   ```bash
   git checkout -b 30-jul-night
   ```
2. Do ALL work on `30-jul-night`. Commit in logical units (one commit per fix or per
   phase is fine). Every commit must leave the test suite green.
3. When — and only when — every fix in this file is implemented, verified against its
   acceptance criteria, and committed, create the follow-on branch from the finished
   state:
   ```bash
   git checkout -b feature-polish
   ```
4. Then STOP. Do not invent or begin new features on `feature-polish`. A second
   specification file describing a set of agentic features will be provided on that
   branch. `feature-polish` exists so that work can begin the moment that file lands.

## Ground rules

- `docs/PRODUCT.md` remains the product authority. Do not violate its interaction
  principles, especially: truthful labels for fixture / local-demo / live-provider
  evidence, no visible controls without working destinations, one primary next action
  per state.
- Never weaken the truthfulness invariants: fixture research stays labelled fixture;
  browser return never confirms payment; only backend-verified Pinch evidence secures
  a supplier; local-demo evidence stays non-authoritative.
- Every fix that changes behaviour needs a test (extend the nearest existing test file).
- After each phase run: `npm test && npm run typecheck && npm run build` — all green.
- Do not commit secrets. `apps/api/.env` stays untracked.
- Beware duplicated logic: the intake adapter exists in BOTH `apps/api/src/aiIntake/localAiIntakeAdapter.ts`
  and `apps/buyer/src/aiIntakeService.ts`; the supplier demo presets exist in BOTH
  `apps/api/src/marketplace/supplierDemoResponses.ts` and `apps/buyer/public/supplierDemoResponses.js`.
  Any fix touching one copy must be applied to (or unified with) its sibling.

---

# PHASE 1 — Demo credibility (highest judging impact)

## Fix 1.1 — Fixture research must adapt to the typed requirement (CRITICAL)

**Problem.** `inferMarketplaceDemoScenario` in `apps/api/src/marketplace/findFixtures.ts`
(~line 31) is binary: anything not matching the robotics regex
(`/\brobot|robotic|palletis|cobot|end[- ]of[- ]arm/`) defaults to the `"plc"` scenario.
A buyer who types a mechanical gearbox failure receives Siemens PLC recovery pathways,
PLC missing-information checklists ("Exact Siemens Controller Family, Firmware..."),
and suppliers matched on "Siemens PLC diagnostics". Verified live: a conveyor-gearbox
requirement produced 100% PLC content. This is the single most credibility-damaging
behaviour in the entire demo.

**Fix.**
1. Add a third, generic industrial scenario (suggested key: `"general"`) to
   `findFixtures.ts`. Its overview, three approaches, missing-information list,
   provenance entries and safety boundary must be TEMPLATED from the structured Need
   Profile rather than hardcoded to a technology:
   - Use the extracted `equipmentOrTechnology`, `requiredCapabilities`, `category` and
     the first sentence of the description to build the overview and approach titles.
   - Keep the same three-pathway shape (evidence capture / controlled intervention /
     validation & prevention) so the UI contract (exactly 3 pathways) is unchanged.
   - Missing-information entries become generic but real (e.g. equipment make/model and
     nameplate data, maintenance/fault history, whether adjacent systems are affected).
   - Provenance entries: keep SafeWork NSW (applies to all industrial electrical/mech
     work) and swap the two Siemens entries for genuinely generic fixture sources
     (e.g. a manufacturer-documentation placeholder and a standards placeholder),
     still labelled `FIXTURE`.
2. Scenario selection: `plc` only when PLC-ish keywords match
   (`/\bplc|siemens|allen[- ]bradley|hmi|scada|controller\b/i`), `robotics` on the
   existing regex, otherwise `general`.
3. Apply the same three-way selection to the supplier demo scenario inference in
   `apps/api/src/marketplace/supplierDemoResponses.ts` (~line 170) and the public copy
   `apps/buyer/public/supplierDemoResponses.js` (~line 86). For the `general` scenario,
   supplier fixture capabilities/experience text must be templated from the requirement's
   capability list rather than mentioning Siemens PLCs.
4. Matching: fixture supplier leads for the `general` scenario must be generated so the
   explainable-match reasons reference the requirement's own required capabilities
   (the match engine already consumes capability strings — feed it the templated ones).

**Acceptance criteria.**
- Typing: "Conveyor motor gearbox on our bottling line in Newcastle NSW is overheating
  and tripping thermal protection every 2-3 hours..." produces three pathways with NO
  mention of Siemens, PLC, controllers, or backups; pathway text references the
  conveyor/gearbox context; supplier match reasons reference the templated capabilities.
- The two demo buttons (`Demo: PLC`, `Demo: Robotic integration`) still produce their
  exact current scenarios (deterministic reset flows must not change).
- New unit tests in `findFixtures.test.ts` cover the three-way inference (plc keyword,
  robotics keyword, generic fallback) and assert the generic scenario contains the
  requirement's equipment string and no "Siemens"/"PLC" strings.

## Fix 1.2 — Supplier "Fill fixture response" must work first-click and produce distinct responses

**Problem (verified live, two separate bugs).**
- `fillDemoResponse` in `apps/buyer/public/supplier.js` (~lines 318-334) fills only the
  decision/commercial fields. The public presets in
  `apps/buyer/public/supplierDemoResponses.js` carry NO company/contact block (the
  backend presets in `apps/api/src/marketplace/supplierDemoResponses.ts` DO, ~line 36).
  For an unclaimed fixture lead the identity fields stay empty, submit stops at
  `form.reportValidity()` (~line 338) with only a native tooltip — an on-stage silent
  failure.
- The fill button always uses the demo select's current value, which defaults to the
  first preset. Two suppliers filled in two tabs both submit the identical
  "$4,200 / fastest response" text, making the comparison view look fabricated.
  (Presets with different prices — $2,900 etc. — already exist but are never reached.)

**Fix.**
1. Add the company/contact block (companyName, contactName, contactEmail, contactPhone)
   to every preset in `apps/buyer/public/supplierDemoResponses.js`, mirroring the
   backend presets. `fillDemoResponse` fills them only when the corresponding input is
   currently empty (never overwrite a claimed supplier's real identity), and ticks are
   NOT applied to the confirmation checkbox — the human must still check it.
2. Vary the default preset per invitation deterministically: derive an index from the
   invitation token (e.g. sum of char codes modulo preset count) so different supplier
   links default to different presets. Keep the select so a presenter can override.
3. When submit fails validation, ALSO set the page's visible status region (the one used
   for "response loaded" messages) to an explicit message, e.g. "Complete the required
   company and contact fields before submitting." Do not rely on the native tooltip alone.
4. Keep everything labelled as fixture demo content exactly as now.

**Acceptance criteria.**
- Open two different supplier invitation links, click "Fill fixture response" then
  "Confirm and submit response" once in each: both succeed with NO manual field entry
  beyond the confirmation checkbox, and the two submitted responses differ in price and
  text.
- Submitting with a deliberately emptied required field shows a visible in-page error
  message.
- Extend `apps/buyer/test/supplierDemoResponses.test.mjs` (and supplier page tests if
  present) to assert presets carry the contact block and that index derivation spreads
  across presets.

## Fix 1.3 — Intake extraction: location, budget, and title truncation

**Problem (verified live).** The deterministic intake adapter failed to extract
"Newcastle NSW" (location detector is a hardcoded 4-entry city whitelist: western
sydney, sydney, melbourne, brisbane) and "20k AUD" (budget regex `\d{1,3}(?:,\d{3})+|\d{3,7}`
cannot match `20k`). Titles are cut with `firstSentence.slice(0, 90)` producing
mid-word garbage ("...overheating and tripping t") shown as the headline on the buyer
plan view, the supplier page, and the comparison heading. The ~230-line adapter is
duplicated: `apps/api/src/aiIntake/localAiIntakeAdapter.ts` and
`apps/buyer/src/aiIntakeService.ts` (~lines 159-204 and 247-248 in each).

**Fix.**
1. Preferred: extract the shared detection/truncation logic into a single module in
   `packages/contracts` (it is already a workspace both apps build against) and import
   it from both adapters. If the contracts package must stay pure-schema, create the
   shared module under `packages/` as a new tiny workspace or an agreed shared path —
   do NOT leave two diverging copies.
2. Budget detection: support `k`/`K` multipliers and currency-adjacent forms —
   `20k`, `$20k`, `20K AUD`, `AUD 20k`, `around 20k` → 20000. Keep existing forms
   working ($18,500 / 18500 etc.). Range forms keep current upper-bound behaviour.
3. Location detection: add an Australian pattern
   `/([A-Z][a-zA-Z' -]+),?\s+(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b/` (case-tolerant for the
   state token), returning "Suburb, STATE" normalised. Keep the existing whitelist as a
   fallback for bare city names.
4. Title truncation: truncate at the last word boundary at or before 87 chars and append
   `…` only when truncation happened. Apply everywhere the 90-char slice exists (both
   adapter copies → the shared module).
5. Urgency: my test input said "within 48 hours" but the profile showed "Required today".
   If the urgency parser maps any "hour" mention to same-day, add a `within N hours`
   rule: ≤24h → today, 25-48h → "within 2 days" (or existing nearest representation).
   There are existing urgency parsing tests in the buyer workspace — extend them.

**Acceptance criteria.**
- The exact string "Conveyor motor gearbox on our bottling line in Newcastle NSW is
  overheating and tripping thermal protection every 2-3 hours. Production down to 40%
  capacity. Need an industrial mechanical contractor to diagnose and repair within 48
  hours. Budget around 20k AUD." extracts location "Newcastle, NSW", budget 20000, a
  title with no mid-word cut, and an urgency that is not "today".
- All existing intake tests still pass; new cases added for each pattern above, running
  against the SHARED module (one test suite, not two divergent ones).

---

# PHASE 2 — Pinch integration polish

## Fix 2.1 — Split the misleading `readiness.pinch` health flag

**Problem.** `GET /api/health` reports `readiness.pinch: false` on a deployment where
real sandbox payment links are being created and `/api/pinch/health` returns
`authenticated: true`. The flag in `apps/api/src/app.ts` (~lines 87-95) ANDs credential
config with `PINCH_WEBHOOK_SECRET` presence and an HTTPS `PINCH_RETURN_URL`, so it
under-reports and will confuse anyone (including a judge) checking health mid-demo.

**Fix.** Replace the single boolean with two:
- `pinchApi`: provider is pinch + client id + secret + auth URL + base URL configured.
- `pinchWebhook`: webhook secret present AND return URL is HTTPS.
Keep `pinch` emitted for backward compatibility as `pinchApi && pinchWebhook`, and
update `scripts/staging-smoke.mjs` (strict profile) to require both new flags, so the
readiness gate semantics are unchanged. Update any tests asserting the old shape.

**Acceptance criteria.** Local dev with test creds but no webhook secret shows
`pinchApi: true, pinchWebhook: false`. Smoke script passes against a fully provisioned
strict deployment and fails when either flag is false. Tests updated.

## Fix 2.2 — Signed-but-unmatchable webhooks must not 500

**Problem.** In `apps/api/src/pinch/pinchRoutes.ts` (~lines 209-243) a validly signed
event that references a missing project/engagement throws inside processing and falls
to the generic 500 handler. Pinch retries 5xx indefinitely → retry storm risk during
the live demo.

**Fix.** After signature verification succeeds, wrap event processing so that
"verified but not matchable to current state" returns `200` with a body like
`{ received: true, processed: false, reason: "no_matching_engagement" }`, records the
event in the webhook summary store as unmatched, and logs it. Only signature failure /
missing secret keep their current 401/503 semantics; genuine internal faults (storage
write failure) may still 500.

**Acceptance criteria.** New route test: signed event with unknown engagement/project
IDs → 200, `processed: false`, no state mutation, event visible in the dev events
endpoint. Existing verified-payment path unchanged.

## Fix 2.3 — Unify reconciliation and event identity

**Problem.** `apps/api/src/marketplace/marketplaceRoutes.ts` (~lines 725-755)
reimplements reconciliation inline with a thin 3-field evidence payload, leaving
`CommitmentPaymentService.reconcileApprovedPayment`
(`apps/api/src/payments/commitmentPaymentService.ts` ~lines 126-178) effectively dead in
the canonical flow. Webhook and reconciliation also mint different event IDs for the
same payment (webhook event id vs `pinch-api:<paymentId>`), so one payment can produce
two authoritative evidence records (state converges; audit trail duplicates).

**Fix.**
1. Make the engagement GET route call `reconcileApprovedPayment` instead of its inline
   copy; keep the swallow-errors-stay-pending behaviour.
2. Deduplicate evidence by Pinch `paymentId` as well as event id in
   `recordAuthoritativePinchPayment` (`apps/api/src/marketplace/store.ts` ~line 1637):
   if authoritative evidence for the same paymentId already exists, do not append a
   second record; keep the first source label.

**Acceptance criteria.** Test: webhook confirmation followed by a reconciliation poll
(or vice versa) for the same payment yields exactly ONE authoritative evidence record
and one supplier-secured transition. Canonical flow uses the service method (inline
duplicate deleted).

## Fix 2.4 — v2 milestone payment links: complete the commitment metadata

**Problem.** `apps/api/src/v2/service.ts` (~lines 963-981) creates milestone payment
links without `commitmentType` / `commitmentAmountMinor` / `commitmentCurrency`, but
reconciliation hard-requires complete commitment metadata, so the v2 reconcile route
always 502s against genuine links.

**Fix.** Include the three commitment metadata keys when v2 creates a link (values from
the milestone record), matching what the canonical marketplace flow sends. Do not
otherwise expand the frozen v2 surface.

**Acceptance criteria.** v2 service test asserting created links carry complete
commitment metadata; reconcile path test no longer 502s on a well-formed link response.

## Fix 2.5 — Surface payment evidence in the buyer Deploy view

**Problem.** The strongest engineering in the project (HMAC-verified webhooks,
metadata-cross-checked reconciliation, sandbox lockdown) is invisible in the UI. Judges
see only a status chip.

**Fix.** In the buyer payment/deployment views (`apps/buyer/src/main.ts`), when the
engagement holds authoritative payment evidence, render a compact "Payment evidence"
panel: evidence source (`Pinch webhook (signature verified)` vs
`Pinch API reconciliation`), Pinch payment id (truncated), amount/currency, and the
recorded timestamp. While awaiting payment, the panel shows what WILL constitute
evidence ("Secured only by verified Pinch webhook or API reconciliation — never by
browser return."). Use existing card/definition-list styles; no new dependencies.

**Acceptance criteria.** After a confirmed sandbox payment (or in tests, an injected
authoritative evidence record) the Deploy view shows source, id, amount, timestamp.
Buyer workspace tests extended for the rendering branch.

---

# PHASE 3 — Workflow traversal & UX

## Fix 3.1 — Navigable journey steps + focus management + Back support

**Problem.** The Find/Connect/Deploy stepper (`renderJourney`, `apps/buyer/src/main.ts`
~line 421) is purely decorative; completed steps are not clickable; browser Back is dead
(`history.replaceState` only); and `render()` rebuilds the DOM with focus dumped on
`<body>` every transition (only `scrollTo(0,0)` runs, ~line 413).

**Fix.**
1. Make COMPLETED journey steps buttons that navigate to a read-only view of that
   phase's primary screen (Find → plan view; Connect → compare view once responses
   exist). Never allow re-entering a mutation that the lifecycle forbids (no re-running
   outreach from the past view; action buttons in revisited views render disabled with
   the existing "state" chips explaining why). The current/incomplete steps stay
   non-interactive. Add `aria-current="step"` to the active step.
2. After every `render()` view change, move focus to the new view's primary heading
   (give it `tabindex="-1"` and call `.focus()`), preserving the scroll-to-top.
3. Push a history entry on view transitions and handle `popstate` to re-render the
   corresponding view (subject to the same lifecycle legality rules; illegal targets
   fall back to the nearest legal view). Refresh-restore behaviour must not regress —
   the existing `resolveRestoredView` tests must stay green.

**Acceptance criteria.** From the compare view, clicking step 1 shows the plan
read-only and step navigation back returns to compare; browser Back mirrors the same;
keyboard focus lands on each view's heading after transitions; all existing continuity
tests pass; new tests cover legal/illegal step navigation.

## Fix 3.2 — Single-response escape hatch at the two-response gate

**Problem.** The outreach view blocks until `submittedResponses >= 2`
(`apps/buyer/src/main.ts` ~lines 1230-1267) and compare refuses selection below 2
(~line 1404). One missing supplier response hard-blocks the demo with no recovery.

**Fix.** When exactly one `can_help` response exists, offer a clearly-labelled secondary
action: "Review the single response (1 of 2)". It opens the compare view in
single-response mode: the response is fully reviewable AND selectable, with an explicit
warning banner ("Only one comparable response was received. Standard flow compares at
least two."). Selection proceeds to the normal engagement path. Keep the primary
messaging encouraging a second response; do not fabricate any response.

**Acceptance criteria.** With one submitted response, the buyer can reach compare,
see the warning, select the supplier, and reach the Pinch commitment. With two+
responses behaviour is unchanged. Tests cover the gate at 0 (blocked), 1 (escape hatch),
2 (normal).

## Fix 3.3 — Landing scroll: no black frames, no text overlap, contrast floor

**Problem (verified live).** During scroll-driven camera transitions on
`apps/buyer/public/landing.html` (scene code `apps/buyer/src/landingScene.ts`,
orchestration `apps/buyer/src/landing.ts`): (a) multi-second fully-black viewport
between stations; (b) the "VELTACT / INDUSTRIAL RESPONSE LINE" breadcrumb renders
behind/through the FIND headline; (c) station copy drops to near-invisible contrast
mid-transition; (d) the right-rail step label collides with the 3D "CONNECT" sign at
some camera angles.

**Fix.**
1. Black frames: audit the camera path/exposure/fade timeline so at least one lit
   element (scene or overlay copy) is visible at every scroll position — either shorten
   the dark travel segments, keep the previous station's copy visible until the next
   station's copy starts fading in, or add a subtle persistent ambient/vignette floor so
   the scene never drops to pure black.
2. Text overlap: give the breadcrumb/topbar overlay a stacking/backdrop treatment (or
   fade it out while the hero headline is on screen) so the two never render
   intermixed.
3. Contrast floor: transition copy opacity must not drop below readable contrast while
   the block is within the viewport — fade copy fully out BEFORE the camera travel
   starts, fully in AFTER it ends, rather than tweening opacity across the whole travel.
4. Verify with `prefers-reduced-motion` ON as well (the static fallback must show all
   station copy legibly).

**Acceptance criteria.** Scrolling the landing at moderate speed on a 1280×720 and a
375×812 viewport never shows a fully black frame longer than ~300ms, never shows
overlapping text, and every copy block is readable whenever it is on screen. Reduced
motion path unaffected or improved.

---

# Final verification (must all pass before creating `feature-polish`)

1. `npm test` — all workspaces green (was 222 tests; the count should only grow).
2. `npm run typecheck` and `npm run build` — clean.
3. Manual smoke of the canonical flow with a NON-demo requirement (the gearbox string
   from Fix 1.3): intake extracts location/budget/urgency; pathways are non-PLC and
   reference the requirement; two supplier links auto-fill DIFFERENT fixture responses
   and submit first-click; comparison shows distinct prices; selection → Pinch payment
   link creation; `/api/health` shows `pinchApi: true`.
4. Manual smoke of both demo buttons (`Demo: PLC`, `Demo: Robotic integration`) — output
   unchanged from pre-branch behaviour.
5. `npm run demo:reset` and `npm run demo:reset -- --robotics` still complete and print
   working URLs.
6. Landing scroll pass per Fix 3.3 acceptance criteria.
7. All work committed on `30-jul-night`; then `git checkout -b feature-polish`; STOP and
   await the agentic-features specification file.
