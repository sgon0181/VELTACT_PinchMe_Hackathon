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

### Cycle A1 — Adversarial Port Lincoln grain terminal (restart required)

- **Scenario:** a bulk grain export terminal in Port Lincoln, SA needed a combined
  mechanical and electrical team within 24 hours for an overheating, tripping
  shiploader conveyor motor and gearbox; the authorised callout and initial repair
  tolerance was phrased as `$14,500`, with additional parts subject to approval and
  grain-contamination controls.
- Empty, repeated-letter and 8,001-character inputs again failed safely before any
  provider call. The valid draft survived refresh and a double-clicked analysis
  action created only one structured result.
- **Defects:** the structured draft omitted explicit gearbox/motor repair and
  electrical-maintenance scope, missed the grain-contamination constraint, called a
  bulk-handling conveyor a packaging conveyor, produced a truncated raw-sentence
  title, and treated `within 24 hours` inconsistently between displayed urgency and
  speed/minimal-downtime state.
- **Fixes:** shared extraction now preserves electromechanical repair scope, uses an
  industrial conveyor outside packaging/bottling contexts, recognises a 24-hour
  deadline as urgent and creates a concise grain-repair title. API and browser
  fallback adapters both retain grain-handling contamination controls.
- **Regression coverage:** shared extraction, API local-adapter and browser-fallback
  tests assert the title, equipment, capabilities, priority and constraints while the
  PLC and robotics regression suites remain unchanged. Two consecutive complete gates
  passed 300 tests plus typecheck and production build.
- **Result:** not clean because the journey exposed extraction defects; restart
  required after remediation.

### Cycle A2 — Adversarial Port Lincoln grain terminal (clean)

- Repeated the empty, low-signal and oversized boundaries from a fresh session. The
  UI stayed actionable and the direct oversized API request returned a friendly 400.
  The valid raw and structured drafts survived refresh; double-clicked analysis and
  need-creation actions produced one Need Profile.
- Selected two of three labelled fixture candidates and double-clicked a link-only
  Send action. Exactly two private invitations were created and the buyer truthfully
  reported that no external delivery was requested.
- Missing/malformed invitation reads, claims and responses returned 404, and the
  malformed supplier page focused its terminal `Invitation not found` heading.
  Supplier commercial fields survived refresh per token while contact identity and
  consent did not persist. Both suppliers then submitted complete can-help offers.
- A pre-selection response replay returned 201 with the original response ID and did
  not create a duplicate. The same replay after buyer selection returned 409 because
  supplier responses were closed.
- Refreshed after analysis, pathway review, matching, outreach, responses, comparison,
  selection, payment-link creation, commitment evidence and every delivery transition.
  The synthetic local return left the engagement pending; explicit local-demo
  evidence was clearly non-authoritative.
- Funded, started and completed Site Assessment, Approved Work, Validation and
  Handover independently. Overall progress tracked the milestone average at
  13/25/38/50/63/75/88/100%, with payment never presented as engineering progress.
- The selected supplier registry relationship reached `Delivered`, the other
  respondent remained `Responded`, the full labelled-fixture activity sequence and
  speed receipt remained ordered, and no surface rendered `undefined`, `NaN` or raw
  ISO timestamps. Buyer, both supplier, malformed-token and local-return tabs recorded
  zero console warnings/errors.
- **Result:** clean. The required adversarial special cycle has passed.

### Cycle C1 — Launceston cold-store compressor motor (restart required)

- **Scenario:** an ammonia cold store in Launceston, TAS needed a licensed
  refrigeration contractor within three business days for a vibrating, intermittently
  tripping compressor drive motor; the buyer phrased the budget as roughly `60k AUD`
  and required cold-room temperature control.
- **Planned response variation:** one can-help response and one explicit decline.
- The mobile-width intake had no horizontal overflow and accurately retained the
  location, timing, budget, ammonia system, compressor, motor, licence requirement and
  temperature-critical constraint.
- **Defect:** category inference evaluated the named drive motor before the dominant
  refrigeration system and incorrectly labelled the requirement `Industrial
  mechanical maintenance`.
- **Fix:** refrigeration/compressor equipment now takes category precedence over a
  component motor, while standalone motor/gearbox work remains industrial mechanical
  maintenance. Shared, API and browser-fallback regressions cover both sides of the
  precedence rule.
- **Verification:** two consecutive 302-test gates, typecheck and production builds
  passed; the served 375×812 intake retest reports `Industrial refrigeration
  maintenance`, keeps zero horizontal overflow and renders no invalid placeholder
  values.
- **Result:** not clean because a classification defect interrupted the journey. The
  clean-streak cycle restarts after the second verification pass.

### Cycle C1R — Launceston cold-store compressor motor (restart required)

- Restarted the corrected refrigeration intake at 375×812, selected quality as the
  buyer priority, reviewed three labelled-fixture pathways and sent exactly two
  link-only invitations. Intake, plan, supplier cards and supplier forms retained zero
  horizontal overflow and moved focus to the newly revealed heading.
- PlantBridge submitted a complete can-help response for AUD 44,500 and 5 August;
  Regional Maintenance Partners explicitly declined because no licensed ammonia crew
  was available within three business days. Both private supplier pages preserved
  truthful fixture disclosures and human-formatted dates.
- **Defect:** the declined comparison card was correctly disabled and labelled
  `Cannot help`, but rendered its schema placeholder as a `$0` price, which could be
  mistaken for a zero-cost quote.
- **Fix:** declined and invalid-price responses now display `Not provided`; only a
  selectable can-help response formats an indicative amount. A unit-level rendered
  bundle regression covers both declined and valid can-help values.
- **Verification:** two consecutive 304-test gates, typecheck and production builds
  passed.
  The served mobile comparison retest shows the disabled decline with `Not provided`,
  no `$0`, no overflow and no console warning/error.
- **Result:** not clean because a comparison defect interrupted the journey. The
  clean-streak cycle restarts after the second verification pass.

### Mobile viewport pass M0 — 320px buyer and supplier surfaces

- Audited the buyer intake/workspace, private supplier opportunity, claim terminal,
  account pages and the responsive rules shared through 375px. Existing grids,
  focus order and content stayed within the 320px document with no console
  warning/error.
- **Defects:** the fixture disclosure's clickable `summary` measured only 16px high;
  its long native-select option was visibly truncated; and buyer-generated Need
  Profile headings had no defensive wrapping for an unbroken serial or title.
- **Fixes:** the disclosure now has a 44px minimum touch target, fixture preset
  labels retain their fixture provenance in compact copy, and buyer headings use
  `overflow-wrap: anywhere`. Focused regressions cover all three guarantees.
- **Verification:** an intentionally unbroken industrial-repair title and a pending
  supplier invitation kept `scrollWidth` equal to 320px. The disclosure measured
  44px, the selected option's scroll width fell from 301px to 232px, and both
  consoles stayed clean. Two consecutive 307-test gates, typecheck and production
  builds passed.
- The documented PLC demo reset restored deterministic fixture state after the
  read-only audit opened one demo invitation.

### Cycle C2 — Hobart cold-logistics compressor repair (restart required)

- **Scenario:** a Hobart, TAS cold-storage distribution site needed a licensed
  refrigeration contractor within three business days for an ammonia screw
  compressor drive motor that was vibrating and tripping; the buyer described an
  approval cap of about `AUD 60k` and selected quality as the priority.
- Intake correctly structured the refrigeration category, equipment, licence,
  location, budget and temperature-critical constraint at 375×812.
- **Defect:** the reviewed `Within 3 business days` field became `Required by: Not
  provided` in the created Need Profile because the buyer-to-marketplace adapter
  discarded the exact phrase and its day parser did not recognise the word
  `business`.
- **Fix:** marketplace profiles now persist the buyer-reviewed timing phrase while
  retaining a parsed numeric urgency for ranking. Business-day and calendar-day
  phrases are parsed, and the API returns the exact phrase in the Need Profile.
- **Verification:** the served 375×812 report now displays `Within 3 business days`
  with no overflow or console warning/error. The API-backed journey asserts
  end-to-end persistence, and two consecutive 307-test gates, typecheck and
  production builds passed.
- **Result:** not clean because the report defect interrupted the journey. The
  clean-streak cycle restarts after verification.

### Cycle C2R — Hobart mixed-response journey (complete, restart required)

- Repeated the Hobart requirement from fresh intake at 375×812. The exact
  three-business-day timing survived the report; the buyer selected a quality-led
  pathway, shortlisted two labelled fixture suppliers and requested link-only
  outreach with no external delivery.
- PlantBridge submitted a can-help offer for AUD 44,500 with 5 August availability;
  Regional Maintenance Partners explicitly declined. Comparison kept the decline
  disabled with `Not provided`, and PlantBridge was selected.
- Explicit local-demo payment evidence funded the commitment. Site Assessment,
  Approved Work, Validation and Handover moved through 13/25/38/50/63/75/88/100%
  engineering progress with buyer-authored updates. The registry ended with
  PlantBridge `Delivered`, the decline `Responded`, the speed receipt complete and
  26 ordered fixture-activity events. Buyer and supplier consoles were clean with
  no horizontal overflow.
- **Retrospective defect:** the final cross-industry review showed the Need Profile
  still labelled this cold-logistics operation `Manufacturing`. The completed flow
  therefore does not count toward the clean streak.

### Cycle C3 — Ballarat wastewater gearbox (restart required)

- **Scenario:** a Ballarat, VIC wastewater treatment plant needed a sludge
  dewatering-conveyor gearbox repaired within five calendar days while bypass
  pumping maintained the process; the approved range was `AUD 28,000-36,000`.
- Equipment, mechanical category, location and budget structured correctly.
- **Defects:** `Within 5 calendar days` was omitted as a missing response time;
  wastewater and bypass-pumping continuity were absent from constraints; and the
  buyer adapter hardcoded `Manufacturing` for both wastewater utilities and the
  preceding cold-logistics need.
- **Fixes:** shared urgency extraction now retains calendar-day and business-day
  qualifiers; both server and browser fixture adapters capture wastewater treatment
  and process-continuity constraints; and the buyer adapter distinguishes water
  utilities, cold logistics and grain handling while preserving the established
  manufacturing fallback used by the demo scenarios.
- **Verification:** the served desktop draft and report retain `Within 5 calendar
  days`, both wastewater constraints and `Water and wastewater utilities`, with no
  overflow or console warning/error. Shared, API and browser regressions pass in two
  consecutive 312-test gates with typecheck and production builds.
- **Result:** not clean because defects interrupted intake. The clean streak restarts
  from a fresh scenario.
