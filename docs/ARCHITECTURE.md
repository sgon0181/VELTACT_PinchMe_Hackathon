# Veltact Architecture

## Product Boundary

Veltact owns one industrial procurement and deployment workflow:

Factory need -> Need Profile -> cited approaches -> local/outsource decision ->
supplier discovery -> approved outreach -> supplier claim and response -> buyer
selection -> project -> Pinch milestone payment -> tracked deployment.

RapidMatch V1 remains available and unchanged at `/index.html`. V2 extends the
same contracts and provider boundaries at `/v2.html`; it is not a rewrite.
Research, outreach and project operations support the workflow rather than
becoming separate products.

## Runtime

- `apps/buyer`: static TypeScript buyer, supplier response and V2 claim pages.
- `apps/api`: one Express and Socket.IO process that owns validation, lifecycle
  transitions, persistence and provider calls.
- `packages/contracts`: shared Zod schemas, TypeScript types and Socket.IO event
  names.
- Pinch, OpenAI, Firecrawl, Resend, SendGrid and Twilio remain backend-only
  provider boundaries.

The API serves compiled frontend assets. The supported demo topology is one API
process and one local JSON repository per domain.

## Product Entry And Role Boundaries

- `/` and `/landing.html` are the public product entry. Their primary action
  starts the V2 buyer journey and presents Find -> Connect -> Deploy as one
  workflow.
- `/v2.html` is the buyer-controlled workspace for requirement, research,
  supplier decision, commercial comparison, project and payment evidence.
- `/supplier-claim.html?token=...` is a private, one-requirement supplier view.
  It is reached from an invitation rather than public navigation and never
  exposes buyer controls or competing suppliers.
- `/index.html` preserves RapidMatch V1 as the classic hackathon flow.
- In non-production environments, the landing page can call
  `POST /api/v2/demo/reset` to generate paired buyer and supplier links. This is
  a repeatable demonstration control, not a production account or navigation
  model.

Buyer and supplier pages are separate permission surfaces over one shared
requirement lifecycle. A general supplier dashboard and user/password accounts
remain outside the prototype boundary.

## Module Boundaries

### RapidMatch V1

- `marketplace/marketplaceRoutes.ts`: HTTP validation and wire serialization.
- `marketplace/store.ts`: authoritative RapidMatch state transitions and audit.
- `marketplace/persistence.ts`: atomic versioned V1 snapshots.
- `marketplace/matching.ts` and `marketplace/suppliers.ts`: deterministic,
  explainable catalog matching.
- `marketplace/outreachDelivery.ts`: email, SMS and WhatsApp adapters.

### Find, Connect, Deploy V2

- `v2/routes.ts`: Zod-validated V2 HTTP boundary.
- `v2/service.ts`: lifecycle, approval, project and milestone rules.
- `v2/repository.ts`: schema-versioned atomic JSON adapter with a serial write
  queue and deterministic reset.
- `v2/providers.ts`: replaceable solution-research and supplier-discovery
  providers.
- `v2/fixtures.ts`: labelled PLC and robotics fallback evidence.
- `realtime.ts`: buyer-scoped V1 and V2 Socket.IO notifications.
- `payments/*` and `pinch/*`: payer, hosted Payment Link, webhook verification
  and reconciliation.

The service depends on repository and provider interfaces, so a transactional
database or alternative research provider can replace the local adapter without
changing route contracts.

## State And Lifecycle

`MARKETPLACE_DATA_FILE` stores V1 state and `VELTACT_V2_DATA_FILE` stores V2
state. Both use temporary-file writes and atomic rename. V2 validates the entire
snapshot at startup, rejects corrupt or incompatible schema versions and
serialises concurrent mutations.

The supplier lifecycle is backend-enforced:

`discovered -> approved_for_outreach -> invited -> claimed ->
supplier_profile_approved -> buyer_approved -> active_supplier`

An active V2 supplier is bridged into the in-process RapidMatch catalog as
supplier-confirmed and buyer-approved. This is not legal identity, licence,
insurance or KYC verification.

## Provider Semantics

- OpenAI Responses API web search is the live research and discovery provider
  when configured.
- Firecrawl search is an optional discovery fallback boundary.
- Deterministic PLC and robotics fixtures keep the demo repeatable and are
  labelled `fixture`.
- Outreach is attempted only for buyer-approved leads. `local_demo` records a
  simulated send but does not deliver externally.
- A browser return from hosted checkout never confirms payment.
- Only verified Pinch webhook evidence or API reconciliation marks a milestone
  funded. Development payment evidence is labelled `local_demo` and is not a
  Pinch transaction or escrow.

## Access And Trust

- Production defaults to per-requirement buyer capability authorization.
- Only the SHA-256 hash of each random buyer token is persisted.
- V2 buyer routes and Socket.IO joins require `x-veltact-buyer-token`.
- Supplier invitation tokens are random, expiring and scoped to one supplier and
  one need.
- Pinch webhooks require a valid timestamped signature.
- Reset and simulated-payment routes are unavailable in production.
- API and AI-intake rate limits are process-local.

Capability tokens are not user accounts. Multi-tenant login, organisation roles,
supplier KYC and multi-process deployment remain outside this prototype.
