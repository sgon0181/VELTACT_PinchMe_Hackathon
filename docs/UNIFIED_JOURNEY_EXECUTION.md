# Unified RapidMatch Journey Execution

## Baseline

All implementation branches must start from the committed Gate 0 baseline on:

`feature/unified-rapidmatch-journey`

Agents must read completely:

- `docs/PRODUCT.md`
- `docs/DEMO_BLUEPRINT.md`
- `docs/ARCHITECTURE.md`
- `docs/INTEGRATION_CONTRACT.md`

No agent may merge to `main`, change shared contracts or create new public route
names without A0 integration review.

## Parallel Work Rule

A1-A4 may implement concurrently after Gate 0, but they must not edit the same
ownership surfaces. Each agent commits and pushes only its own branch.

Recommended branches:

- `feature/unified-find-core`
- `feature/unified-buyer-journey`
- `feature/unified-supplier-connect`
- `feature/unified-pinch-deploy`

## A1 - Canonical Marketplace Core

Owns:

- `apps/api/src/marketplace/store.ts`
- `apps/api/src/marketplace/persistence.ts`
- `apps/api/src/marketplace/marketplaceRoutes.ts`
- New RapidMatch-owned research/discovery service modules.
- Marketplace and persistence tests.

Deliver:

1. Persist research result and solution decision against the RapidMatch Need
   Profile ID.
2. Implement reserved research, decision and supplier-discovery routes.
3. Extract reusable research/discovery provider logic from V2 behind
   RapidMatch-owned interfaces.
4. Map discovered public evidence to `SupplierLead` without automatic outreach
   or enrolment.
5. Return canonical aggregate fields without breaking existing RapidMatch
   response shapes.
6. Add deterministic PLC and robotics research/discovery fixtures.
7. Add tests for lifecycle order, persistence, provenance and buyer capability
   authorization.

Do not edit:

- Buyer UI.
- Supplier UI.
- Pinch/payment modules.
- Shared contracts.
- `/api/v2` behavior except extracting reusable code without regression.

## A2 - Canonical Buyer Journey

Owns:

- `apps/buyer/src/main.ts`
- `apps/buyer/src/rapidMatchService.ts`
- `apps/buyer/src/types.ts`
- `apps/buyer/public/styles.css`
- Generated buyer assets.

Deliver:

1. Extend the existing RapidMatch UI rather than V2.
2. Preserve text, PDF and photo evidence intake.
3. Add a Find result state with Need Profile, one recommended approach,
   collapsible alternatives, citations and missing information.
4. Add exactly two Find outcomes:
   `Use this plan internally` and `Find a specialist`.
5. Keep existing RapidMatch matching, outreach, response and Pinch screens.
6. Replace repeated/competing actions with one primary next action per state.
7. Add a lightweight Deploy view using `DeploymentSummary`.
8. Preserve workspace identity across browser refresh.
9. Validate desktop and 390 px mobile layouts.

Do not edit:

- API store/routes.
- Supplier page.
- Realtime server.
- Payment modules.
- Shared contracts.
- V2 buyer UI.

A2 may use contract-valid fixture data while A1/A4 APIs are in progress, but
must integrate the real canonical routes before completion.

## A3 - Supplier, Outreach And Realtime

Owns:

- `apps/buyer/public/supplier.html`
- `apps/buyer/public/supplier.js`
- Supplier-page styles.
- `apps/api/src/marketplace/outreachDelivery.ts`
- `apps/api/src/realtime.ts`
- New supplier/demo-response helper modules.
- Outreach and realtime tests.

Deliver:

1. Keep one private RapidMatch supplier opportunity page.
2. Combine minimal supplier confirmation and standard response into one concise
   experience while preserving separate backend transitions.
3. Include proposed approach and assumptions in the response.
4. Emit only canonical `rapidmatch:*` events for the unified journey.
5. Report `not configured` separately from attempted provider failure.
6. Keep provider-accepted email/SMS delivery semantics truthful.
7. Provide two contrasting, labelled deterministic responses for each guided
   scenario, with one suitable for live second-tab submission.
8. Preserve token expiry and role isolation.

Do not edit:

- Buyer `main.ts`.
- Marketplace store/routes except via a narrowly documented integration patch
  agreed with A0/A1.
- Pinch/payment modules.
- Shared contracts.
- V2 supplier claim UI.

## A4 - Pinch Commitment And Lightweight Deploy

Owns:

- `apps/api/src/pinch/*`
- `apps/api/src/payments/*`
- New `apps/api/src/deployment/*` modules.
- Payment/deployment tests.

Deliver:

1. Preserve real Pinch authentication, payer creation and hosted Payment Link.
2. Attach the selected RapidMatch engagement to a commitment milestone.
3. Derive a four-stage `DeploymentSummary` for PLC and robotics.
4. Derive progress from milestone completion, never payment alone.
5. Connect verified webhook/reconciliation evidence to `supplier_secured`.
6. Reuse an existing valid payment link.
7. Expose reserved deployment read/update behavior through a service/router
   that A0 can register without route-name changes.
8. Keep local demo evidence explicit and unavailable in production.

Do not edit:

- Buyer or supplier UI.
- Marketplace matching/outreach.
- Shared contracts.
- V2 task, issue, approval or change-control features.

Do not implement or claim commission collection unless the provider flow
actually records it.

## A0 - Integration Gates

A0 owns:

- Product and demo truth.
- Shared contracts and route/event names.
- Root configuration.
- Final route registration.
- Cross-module adapters.
- Merge order.
- Browser acceptance.

Merge order:

1. A1 canonical marketplace core.
2. A3 supplier/outreach/realtime.
3. A4 Pinch/deployment.
4. A2 canonical buyer UI.
5. A0 integration fixes only.

Before each merge:

- Rebase on the latest integration branch.
- Run lint, typecheck, tests and build.
- Report changed files and unresolved risks.

## Release Acceptance

From a fresh reset, both PLC and robotics must complete:

`evidence -> Need Profile -> cited plan -> Find a specialist -> matches ->
outreach -> two responses -> comparison -> selection -> Pinch commitment ->
supplier secured -> deployment progress`

Release checks:

- One public buyer journey.
- No public V2 navigation.
- No duplicate store dependency in the canonical flow.
- Browser refresh preserves the buyer workspace.
- No browser console errors.
- No horizontal overflow at 390 px.
- No exposed credentials or capability tokens in logs.
- Fixture, provider and payment claims remain truthful.
