# Veltact User-Simulation QA Marathon

**Branch:** `qa/user-simulation`
**Base:** `feature-polish` at `5478cd2`
**Date:** 31 July 2026 (Australia/Sydney)
**Profile:** keyless fixture research/discovery, local-demo outreach and payment

## Safety and verification baseline

- `npm install`: dependencies already current; 0 audit vulnerabilities.
- Provider health confirmed `research=fixture`, `email=local_demo`, `sms=none`,
  `payment=local_demo`, with OpenAI and Pinch readiness false.
- Baseline gate: 268 tests passed; typecheck and production build passed.
- Landing implementation files are excluded from this QA branch.

## Cycle log

Each cycle records the human scenario, response variation, observations, fixes,
automated evidence, and browser retest result. A cycle is clean only when the
complete buyer and supplier journey finishes without functional, truthfulness,
accessibility, console, or responsive-layout defects.

### Cycle 1 — Darwin cold-store emergency (restart required)

- **Scenario:** A seafood cold store in Darwin, NT needed a licensed industrial
  refrigeration contractor within 12 hours for an ammonia compressor with severe
  vibration and low oil-pressure alarms; approval limit stated as AUD 28,000.
- **Planned supplier variation:** two suppliers able to help.
- **Defects at intake:** the deterministic adapter failed to identify the ammonia
  refrigeration equipment and licensed-contractor capabilities, used the generic
  `Industrial services` category and a truncated raw-input title, described a
  seafood cold store as a packaging context, and displayed singular/plural variants
  of the same missing capability as separate fields.
- **Fixes:** added industrial refrigeration extraction, title/category,
  urgency/capability and cold-storage constraint coverage; added semantic
  de-duplication for missing-field labels.
- **Regression coverage:** contracts extraction, API local-adapter and buyer
  missing-field tests. The gate now passes 271 tests plus typecheck and production
  build.
- **Browser retest:** the served keyless UI now reports 92% confidence, the specific
  ammonia system and compressor, five relevant capabilities, the industrial
  refrigeration category, one honest missing field (buyer email), and no console
  warning/error. Because a defect interrupted the journey, this cycle does not count
  as clean and will restart from intake.

### Cycle 1R — Darwin cold-store emergency (complete, defects found)

- **Response variation:** PlantBridge and Regional Maintenance Partners both
  submitted can-help offers through their separate private links. The buyer selected
  PlantBridge for its earlier response date despite the higher indicative price.
- **Journey evidence:** link-only outreach truthfully reported that no external
  delivery was requested; opening the synthetic return left payment pending; explicit
  local-demo evidence secured the engagement; all four milestones were separately
  funded, started and completed with buyer-facing delivery updates.
- **Final verification:** the selected registry relationship became `Delivered`, the
  other respondent remained `Responded`, the fixture research/discovery activity
  timeline contained its full ordered history, the speed receipt retained every
  commitment and milestone-funding event, and all four milestones reached 100%.
  Buyer, both supplier and payment-return tabs had no console warning/error.
- **Defects found:** supplier-entered date-only availability appeared as raw ISO text;
  supplier/account state changes lacked focus placement; unchanged buyer polling
  repeatedly collapsed the open milestone form and discarded focus; a refrigeration
  engagement was labelled `PLC recovery deployment`; an in-progress milestone showed
  50% locally while overall engineering progress stayed at the previous completed-only
  percentage.
- **Additional adversarial/static defects queued from the same pass:** unsaved intake
  and supplier response drafts did not survive refresh, intake had no explicit size
  bound or empty-state unlock guidance, clipboard denial could become an unhandled
  dead action, and long unbroken PDF content could overflow.
- **Result:** not clean. Fixes and focused regressions are being integrated before the
  scenario matrix restarts.

### Remediation gate after Cycle 1R

- Added UTC-safe date-only presentation across buyer, supplier receipt and quote PDF;
  long unbroken PDF tokens now split to the printable width.
- Added refresh-safe pre-Need and token-scoped unsent supplier drafts, explicit
  24–8,000 character intake boundaries, disabled-state guidance, provider guards and
  clipboard fallback/recovery.
- Added focus placement for supplier/account state transitions and buyer rerender
  preservation for focused controls, text selection, scroll position and open
  disclosures. Polling now skips a rerender when only the receipt-generation
  timestamp changed.
- Added a general industrial deployment template so non-PLC work is not labelled as
  PLC recovery. PLC and robotics inference and their deterministic milestone sets are
  explicitly regression-tested. Overall engineering progress now averages the
  milestone progress values, so an in-progress first milestone reports 13% rather
  than contradicting its own 50% card.
- **Full gate:** 297 tests passed (14 staging/contracts, 164 API, 110 buyer,
  9 shared contracts); typecheck and production build passed.
- **Served browser retest:** both supplier receipts and the buyer comparison render
  `1 Aug 2026` / `2 Aug 2026` with no raw date-only ISO; receipt and comparison
  headings receive focus; typed and structured pre-Need drafts survive reload; and a
  priority choice retains keyboard focus through its same-view rerender.

### Cycle D0 — Deterministic demo buttons (complete, defect found)

- **PLC button:** preserved the exact HarbourPack PLC title, $1,800 tolerance,
  Western Sydney location, speed priority, fixture evidence and three documented
  pathways. Two fixture suppliers responded through private links. The selected
  supplier was locally secured and all Diagnosis / Recovery / Validation / Handover
  releases were funded and completed.
- **Robotic integration button:** preserved the exact ABB/Siemens integration scope,
  $180,000 upper budget, technical-fit priority and robotics-only fixture responses.
  The selected supplier completed Site Assessment / Scoping Visit, Design,
  Installation and Commissioning.
- Both journeys finished at 100%, upgraded the selected registry relationship to
  `Delivered`, retained the complete labelled-fixture activity timeline and recorded
  every funding event in the speed receipt.
- **Defect:** buyer radio and checkbox rerenders restored focus but attempted
  `setSelectionRange` on non-text inputs, generating six console errors across the two
  journeys.
- **Fix:** caret capture/restore is now limited to text-selection-capable inputs and
  textareas; checkbox/radio focus remains preserved. The 297-test, typecheck and
  production-build gate passed again. This attempt does not count as a clean demo
  cycle and both button journeys will be rerun.

### Cycle D1 — Deterministic demo buttons (clean)

- Reran both the PLC and Robotic integration buttons from fresh intake workspaces.
  Their exact titles, budgets, locations, priorities, evidence, pathways, fixture
  response families and scenario-specific milestone names remained deterministic.
- Each subjourney used two private supplier links, two fixture responses, buyer
  comparison and selection, a labelled local-demo commitment, four separately funded
  releases and four accepted delivery outcomes.
- Both selected registry relationships reached `Delivered`; fixture agent activity
  and complete speed receipts remained available; buyer and supplier tabs recorded
  zero console warnings/errors.
- **Result:** clean. The required demo-button special cycle has passed.

### Cycle A0 — Adversarial Port Lincoln intake (restart required)

- Empty intake stayed disabled with nearby minimum-context guidance. A 40-character
  repeated-letter payload was rejected before analysis with actionable copy and its
  input remained available for correction.
- An 8,001-character payload was disabled in the buyer UI and rejected by the API
  with JSON before provider selection.
- **Defect:** the oversized helper exposed the numeric overage but did not explicitly
  tell the user how to recover.
- **Fix:** oversized guidance now states the 8,000-character limit and the exact
  number of characters to remove, with a boundary regression test. The adversarial
  cycle restarts after the full gate.
