# Veltact 2.0 Build Log

This log records autonomous build loops for the `codex/veltact-2-find-connect-deploy`
branch. A loop is only complete after implementation, automated verification, and
an explicit note about remaining risk.

## 2026-07-26 - Baseline and Scope Lock

### Inspected

- Confirmed `main` and `origin/main` at `fa2b848`.
- Created `codex/veltact-2-find-connect-deploy` from that commit.
- Preserved the previous buyer design preview as
  `docs/design/buyer-workspace-preview.html` so it is not served as a product page.
- Read the existing product, architecture, integration, disclosure, outreach, and
  security documentation.
- Reviewed the current contracts, API, buyer and supplier flows, AI intake,
  outreach adapters, persistence, realtime events, and Pinch integration.

### Verified

- `npm install`: passed with zero reported vulnerabilities.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed, 28 tests.
- `npm run build`: passed.

### Decisions

- Preserve the existing Express, vanilla TypeScript, Zod, Socket.IO, npm
  workspaces, OpenAI, outreach, and Pinch implementation.
- Add Veltact 2.0 as an incremental Find, Connect, Deploy workflow.
- Keep Australia and AUD as the initial operating boundary.
- Require buyer approval before supplier outreach.
- Treat public-web supplier information as discovery evidence, not verification.
- Treat Pinch Payment Links as milestone billing, not escrow.
- Keep deterministic demo fixtures available when external providers are absent.

### Next Loop

Define V2 shared contracts, lifecycle rules, API/event names, and a versioned
atomic JSON repository with validation and deterministic reset support.

## 2026-07-26 - Find, Connect, Deploy Vertical Slice

### Implemented

- Added shared contracts for research citations, solution approaches and
  decisions, discovered supplier leads, supplier claims and profiles, commercial
  responses, industrial projects, tasks, dependencies, milestones, acceptance
  criteria, risks, issues, approvals, documents, changes, contacts, and payment
  evidence.
- Locked V2 Socket.IO events under the `veltact:v2:*` namespace.
- Added a schema-versioned atomic JSON repository with complete Zod startup
  validation, temp-file rename, serial writes, explicit incompatible-data
  failure, and reset support.
- Added cited solution research and supplier discovery provider interfaces.
- Added live OpenAI web-search implementations, optional Firecrawl discovery,
  and deterministic PLC recovery and robotic integration fixtures.
- Enforced supplier lifecycle transitions:
  `discovered -> approved_for_outreach -> invited -> claimed ->
  supplier_profile_approved -> buyer_approved -> active_supplier`.
- Reused controlled Resend/SendGrid/Twilio delivery adapters and added message
  identity, invitation purpose, no-auto-enrolment, and opt-out wording.
- Added supplier claim/profile approval, buyer activation, standard response,
  comparison, selection, industrial project creation, milestone funding,
  acceptance dependencies, task state, and change control APIs.
- Extended Pinch metadata with project and milestone identifiers and connected
  verified webhook/reconciliation evidence to milestone state.
- Built the `/v2.html` buyer workspace and `/supplier-claim.html` supplier
  workflow.
- Added `npm run demo:reset`.

### Verified

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed, 33 tests.
- `npm run build`: passed.

### Remaining Risk

- Browser-level full-flow verification is still required.
- Live OpenAI, Firecrawl, outreach, and Pinch calls depend on human-provided
  credentials and approved destinations.
- Local fixture candidates are intentionally fictional and must not be described
  as real discovered suppliers.

### Next Loop

Reset the application, exercise buyer and supplier tabs through milestone
funding, inspect desktop and mobile layouts, fix observed issues, then repeat the
browser run from a fresh reset.

## 2026-07-26 02:31 AEST - Browser Hardening and Release Pass

### Exercised

- Completed the seeded PLC workflow through research, supplier discovery,
  approved outreach, claim, supplier and buyer profile approval, activation,
  standard response, selection, project creation, milestone funding and
  acceptance, task progression and change control.
- Repeated the supplier, project and payment path with the planned robotic
  integration scenario.
- Inspected buyer desktop and 390 x 844 mobile layouts, supplier desktop and
  mobile layouts, and browser console output.
- Started from an empty V2 workspace, structured the robotics brief through AI
  intake and created a Need Profile.

### Improved

- Prevented polling and realtime refreshes from replacing active form edits.
- Suppressed transient background-refresh errors while preserving foreground
  action errors.
- Avoided repository writes every time an already-open supplier claim polls.
- Added project-appropriate robotics defaults to the supplier response form.
- Preserved comma-formatted six-figure intake budgets and added regression
  coverage.
- Corrected native number-step validation so round project budgets submit.

### Verified

- Buyer and supplier console errors: none.
- Desktop and mobile horizontal overflow: none observed.
- AI intake retained `AUD 120,000` and the resulting Need Profile displayed
  `$120,000`.
- Automated tests: 34 passed after the intake regression.

### Remaining External Actions

- Live OpenAI, Firecrawl, outreach and Pinch calls require operator credentials.
- HTTPS tunnel behavior requires a tunnel selected and started by the operator.
- The deterministic fallback remains the supported credential-free demo path.

## 2026-07-26 08:36 AEST - Unified Product Journey

### Implemented

- Made the public landing page the clear Veltact entry with one primary
  `Start a requirement` action and one Find -> Connect -> Deploy narrative.
- Kept RapidMatch V1 available as the explicitly labelled classic demo.
- Added a non-production guided launcher that creates paired buyer and private
  supplier links for the PLC and robotics scenarios.
- Clarified the buyer-to-supplier handoff, shared lifecycle progress and
  role-specific permissions in both workspaces.
- Documented the public entry, capability boundaries and repeatable demo
  operation.

### Verified

- Guided robotics reset returned buyer and supplier URLs for the same need.
- Public landing, buyer Connect view and private supplier invitation loaded
  without browser console errors.
- Desktop and 390 x 844 layouts had no horizontal overflow.
- `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` passed.
- Automated tests: 34 passed.

### Remaining External Actions

- Production provider readiness still depends on operator-supplied OpenAI,
  outreach and Pinch credentials.
- The guided reset launcher is intentionally hidden in production.

## 2026-07-26 10:41 AEST - Unified RapidMatch Gate 0

### Decisions

- Made `docs/PRODUCT.md` authoritative for the canonical buyer journey.
- Confirmed RapidMatch as the application base and Connect engine.
- Classified V2 as temporary donor code for research, provenance, milestone
  templates and payment evidence.
- Reserved one RapidMatch route/event namespace for Find, Connect and Deploy.
- Defined non-overlapping A1-A4 ownership and A0 merge gates.

### Contracts

- Added shared intake evidence and safe evidence-summary contracts.
- Added aggregate Find, Connect and Deploy journey state and next-action enums.
- Added a canonical RapidMatch buyer workspace projection.
- Extended supplier responses with optional approach, assumptions and profile
  linkage.
- Added lightweight deployment and milestone summaries.
- Exported canonical RapidMatch API route templates and Socket.IO event names.

### Verified

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed, 34 tests.
- `npm run build`: passed.

### Next Gate

Branch A1-A4 from this baseline. Merge canonical marketplace core first, then
supplier/outreach, Pinch/deployment and the buyer UI.
