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
