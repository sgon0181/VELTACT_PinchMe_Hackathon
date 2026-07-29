# Archived: Veltact Polished Staging Demo Charter

## Authority

This charter is the execution brief for the polished staging demo. Agents must
read it before changing code.

Authority order:

1. `docs/PRODUCT.md` defines the product.
2. `docs/DEMO_BLUEPRINT.md` defines the demonstrated journey.
3. `docs/ARCHITECTURE.md` and `docs/INTEGRATION_CONTRACT.md` define boundaries.
4. This charter assigns implementation work and release gates.

Git history preserves earlier product directions. Do not create a parallel
documentation archive or revive an older workflow from commit history.

## Baseline

All agent branches start from the A0 staging baseline derived from committed
`Recurssion` SHA `a13f021`.

RapidMatch is the implementation base. V2 is migration-only donor code. No
agent may add product features to `/v2.html`, `/supplier-claim.html` or
`/api/v2/*`.

## Locked Product

Veltact is one workflow:

`Problem evidence -> Find -> Connect -> commitment -> Deploy`

The buyer:

1. Describes a factory problem and may attach PDF or photo evidence.
2. Reviews a structured Need Profile and three solution pathways.
3. Selects one pathway and downloads the resulting report or finds suppliers.
4. Selects supplier candidates and chooses email, SMS or copy-link outreach.
5. Receives standardised commercial responses through private supplier links.
6. Compares responses and selects one supplier.
7. Opens a Pinch hosted checkout for a commitment payment.
8. Sees the supplier secured only after authoritative backend payment evidence.
9. Enters a lightweight project view beginning with Site Assessment / Scoping.

The demo does not claim that Pinch paid the supplier, that Veltact provides
escrow, or that engineering work started because payment completed.

## Public Entry

The public header uses exactly:

- `Sign in`
- `Create account`
- `Try demo`

`Try demo` must remain available without authentication. Sign-in and account
creation are an isolated account workstream and must not destabilise the
canonical demo.

The loading treatment may use Veltact's approved wolf mark, a dark metallic red
surface and restrained mechanical detail. It must finish quickly, respect
reduced-motion settings and never delay access after the application is ready.

## Canonical Surfaces

- `/` and `/landing.html`: loading transition and public product story.
- `/index.html`: the only buyer workflow.
- `/supplier.html?token=...`: the only supplier workflow.
- `/signin.html`: account sign-in.
- `/create-account.html`: account registration.

Primary navigation must not expose V2 routes.

## Canonical Buyer States

The UI may group backend statuses, but it must present this sequence:

`intake -> report -> solution_selected -> discovery -> outreach ->
quote_collection -> comparison -> commitment -> project`

Each state has one dominant next action. Internal lifecycle transitions,
capability tokens and provider details are not additional buyer decisions.

## Staging Acceptance

### Find

- Written requirements, PDF evidence and photo evidence work.
- AI output remains editable or buyer-reviewed.
- The report presents one Need Profile and exactly three selectable pathways.
- One pathway is selected before supplier discovery.
- `Download report` returns a useful PDF.
- `Find suppliers` passes the selected scope into Connect.

### Connect

- At least three candidates show name, logo or safe fallback, location,
  explainable score, provenance and risk labels.
- The buyer can select one or more candidates.
- `Send email`, `Send SMS` and `Copy link` have distinct, truthful behavior.
- External delivery is never reported as sent without provider acceptance.
- Every generated supplier URL uses the configured HTTPS public origin.

### Supplier

- A token-scoped link opens from a phone without buyer access.
- The supplier sees the RFQ, why it matched and source disclosure.
- The supplier can download the RFQ.
- The supplier can submit availability, positive price, experience, approach,
  assumptions and conditions from one concise form.
- A submitted response can be downloaded as a quote summary.
- Realtime or resilient polling updates the buyer without a manual reset.

### Commitment And Deploy

- The buyer compares at least two responses and selects one.
- The selected response creates one engagement.
- Real Pinch mode creates a real payer and hosted Payment Link.
- Browser return does not secure the supplier.
- Verified webhook or reconciliation evidence secures the engagement.
- The UI says `Commitment paid` or `Supplier secured`, never `Supplier paid`.
- An idempotent supplier email announces the confirmed commitment.
- The project begins at `Site Assessment / Scoping Visit` with 0% engineering
  progress and no fabricated completion.

## Workstreams

### A0 - Integration And Product

Own shared contracts, route names, root configuration, canonical documents,
integration order, staging deployment and end-to-end acceptance. A0 resolves
all cross-agent conflicts.

### A1 - Find And Supplier Discovery

Implement report generation, selected-solution enforcement, supplier
discovery, match evidence, logo metadata and selected-candidate preparation.
Do not edit buyer presentation or provider delivery adapters.

### A2 - Buyer Experience

Implement the canonical buyer states in `/index.html`: intake, white report,
solution selection, supplier selection, outreach controls, comparison,
commitment and project summary. Consume contracts; do not invent routes.

### A3 - Supplier And Outreach

Implement email/SMS delivery selection, copy-link generation, supplier RFQ,
RFQ/quote downloads, realtime response updates and commitment-confirmed email.
Do not change Pinch payment authority.

### A4 - Pinch And Deploy

Own payer creation, hosted Payment Link, webhook/reconciliation, commitment
evidence and deployment milestone transitions. Do not implement supplier payout
or invoice claims.

### A5 - Brand And Public Experience

Own loading treatment, landing page, public navigation, approved brand assets,
global design tokens and final visual QA. During parallel work, do not edit the
canonical buyer workflow components or workflow-specific styles.

### A6 - Accounts And Platform

Own minimal email/password account access, session verification, staging
platform configuration and account pages. The demo bypass must remain public.
Do not replace capability-token security until A0 approves a migration.

## Integration Order

1. A0 contracts and route freeze.
2. A1 Find/Connect services.
3. A3 supplier/outreach services.
4. A4 payment/deployment services.
5. A2 buyer workflow.
6. A5 final visual pass.
7. A6 account integration only after the canonical demo passes.

Agents work from separate branches and commit focused changes. A0 integrates
one workstream at a time and runs the complete gate after every merge.

## Release Gate

The staging branch is releasable only when:

- `npm ci` succeeds from a clean checkout.
- Lint, typecheck, all tests and production build pass.
- PLC and robotic-integration journeys both pass.
- One real email and one real SMS link open on a physical phone.
- One supplier response updates the buyer.
- Real Pinch sandbox checkout and authoritative confirmation pass.
- Refresh preserves the active buyer workspace.
- Desktop and mobile have no overlap or horizontal overflow.
- No secret or unapproved asset is committed.
- The deployed HTTPS URL passes `/api/health`.
