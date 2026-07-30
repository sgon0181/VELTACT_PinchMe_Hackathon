# Veltact Architecture

## Architecture Decision

RapidMatch is the canonical application base.

The target architecture extends its existing requirement, matching, outreach,
response, engagement and Pinch flow with selected V2 capabilities:

- Cited solution research.
- Public supplier-discovery provenance.
- Supplier consent safeguards.
- Commitment milestone templates.
- Payment evidence.
- Lightweight deployment progress.

The V2 buyer UI, duplicate lifecycle and separate persistence model are not the
target architecture. They remain donor code during migration and must not be
expanded as a separate product.

## Canonical Workflow

One buyer workspace owns one requirement across:

`Find -> Connect -> Deploy`

Domain progression:

`evidence -> Need Profile -> research -> selected solution -> report -> matches
-> approved outreach -> responses -> selection -> engagement -> Pinch
commitment -> secured -> milestone funding -> delivery progress -> speed
receipt`

Normal workflow activity also builds a private supplier registry. The registry
is not a second journey or a supplier-enrolment shortcut; it is a persisted
relationship projection that improves later matching for the same buyer
account.

The aggregate journey state is a view over domain records. Existing domain
status enums remain authoritative for Need Profile, invitation, response,
engagement and payment transitions.

## Runtime

- `apps/buyer`: canonical RapidMatch buyer page and private supplier response
  page.
- `apps/api`: one Express and Socket.IO process owning validation, lifecycle,
  persistence and provider calls.
- `packages/contracts`: the only owner of public wire schemas, route templates
  and Socket.IO event names.
- Pinch, OpenAI, Perplexity, Firecrawl, Resend, SendGrid and Twilio:
  backend-only provider boundaries.

The API serves compiled frontend assets. The supported demo topology is one API
process and one canonical marketplace repository.

## Public Surfaces

Target surfaces after migration:

- `/` and `/landing.html`: public product entry.
- `/index.html`: canonical RapidMatch-based buyer workspace for Find, Connect
  and Deploy.
- `/supplier.html?token=...`: private supplier opportunity and response.
- `/signin.html` and `/create-account.html`: isolated account entry.

Migration-only surfaces:

- `/v2.html`
- `/supplier-claim.html?token=...`
- `/api/v2/*`

Migration-only surfaces may remain available to tests while capabilities are
extracted. They must not remain in primary navigation or receive independent
product features.

Canonical implementation entry points are:

- `apps/buyer/src/main.ts` for the buyer state machine.
- `apps/buyer/public/supplier.html` and `supplier.js` for the private supplier
  opportunity.
- `apps/api/src/marketplace/*` for the canonical journey repository and routes.

`apps/buyer/src/v2.ts`, `v2.html`, `supplierClaim.ts`,
`supplier-claim.html` and `apps/api/src/v2/*` are frozen donor or
migration-test surfaces. No canonical screen may import them or link to them.

## Module Ownership

### Find

- `aiIntake/*`: text, PDF and image evidence validation and Need Profile
  structuring.
- `marketplace/store.ts`: canonical requirement ownership and persisted journey
  records.
- V2 `providers.ts` research boundary: donor implementation to move behind a
  RapidMatch-owned service interface.
- V2 fixtures: donor evidence for deterministic PLC and robotics scenarios.

Find returns research and buyer decision records attached to the same
RapidMatch Need Profile ID.

The report/export boundary renders only persisted Need Profile, research,
selected-solution and citation records. PDF rendering must not call AI again.

### Connect

- `marketplace/marketplaceRoutes.ts`: canonical HTTP boundary.
- `marketplace/store.ts`: matching, invitation, response, selection and audit
  transitions.
- `marketplace/persistence.ts`: canonical atomic snapshot.
- `marketplace/matching.ts` and `marketplace/suppliers.ts`: deterministic and
  explainable matching.
- `marketplace/findProviders.ts`: live/fixture research and discovery provider
  boundary.
- `marketplace/candidateDiscovery.ts`: one explainable ranking pipeline for
  live, fixture and registry candidates.
- `marketplace/outreachDelivery.ts`: controlled email, SMS and WhatsApp
  adapters.
- `realtime.ts`: canonical RapidMatch buyer updates.

The supplier UI may combine profile consent and quote submission into one
screen. Backend consent and response records remain distinct.

Invitation creation and external delivery remain separate operations. Copying a
link creates no fabricated delivery record. RFQ and quote exports are generated
from persisted canonical records.

Supplier registry entries live in the canonical marketplace snapshot. Store
write-through hooks upgrade provenance after discovery, outreach, response,
the recorded supplier-securing transition and completed delivery. The linked
engagement retains whether payment evidence was authoritative. Later
requirements may inject capability-compatible registry entries into candidate
discovery with a bounded, explainable history bonus.

### Deploy

- `payments/*` and `pinch/*`: payer, hosted Payment Link, webhook verification
  and reconciliation.
- Existing RapidMatch `Engagement`: commercial root after supplier selection.
- V2 project templates and payment evidence: donor logic used to create a
  minimal deployment summary.
- `marketplace/speedReceipt.ts`: read-only timestamp projection over persisted
  requirement, response, payment and milestone evidence.

The canonical Deploy contract exposes the commitment, milestones and progress,
not the full V2 task, issue, document, approval and change-request surface.
Every funded milestone reuses the same authoritative Pinch boundary and owns
its own link and evidence IDs. Payment state cannot advance engineering
progress.

## Data Ownership

`MARKETPLACE_DATA_FILE` is the target canonical repository.

During migration, `VELTACT_V2_DATA_FILE` remains readable only by migration-only
V2 routes. New canonical journey features must persist under the RapidMatch
repository. No user-facing workflow may require coordinated reads from both
stores.

The canonical snapshot includes supplier registry entries, activity events,
per-milestone payment evidence and the timestamps used to assemble speed
receipts. Receipt records are projections and are not a competing source of
truth.

Once parity is achieved:

1. Canonical tests no longer depend on `/api/v2`.
2. Public navigation no longer links to V2.
3. Useful provider/template code has moved behind RapidMatch interfaces.
4. V2 routes and storage can be retired separately.

## Access And Role Boundaries

- Buyer capability authorization is scoped to one Need Profile.
- Only hashes of random buyer tokens are persisted.
- Supplier tokens are random, expiring and scoped to one invitation.
- Supplier views never expose competing suppliers or buyer controls.
- Reset and simulated-payment routes are unavailable in production.
- Pinch webhooks require verified timestamped signatures.

Capability tokens are not user accounts. Minimal account access may be added
around the buyer entry, but the public demo and supplier token flow must remain
independent. Replacing capability tokens with organisation authorization is a
separate reviewed migration.

## Provider Semantics

- OpenAI may structure intake and return cited solution research when
  configured.
- OpenAI web search, optional Perplexity or Firecrawl may return supplier
  candidate evidence.
- Discovery never triggers outreach or enrolment.
- Buyer approval is required before contact.
- Supplier confirmation is required before activation.
- Deterministic fixtures remain visibly labelled.
- Delivery is `sent` only after provider acceptance.
- An unavailable provider is `not configured`, not a failed attempt.
- Browser return never confirms Pinch payment.
- Only verified webhook or reconciliation evidence is authoritative.
- Local demo payment evidence is not a Pinch transaction.
- Registry history is private, bounded and subordinate to capability fit.

## UI Constraint

The canonical frontend preserves RapidMatch's interaction density:

- One primary next action per state.
- Progressive disclosure for citations and evidence.
- One selected solution and two outcomes at the end of Find.
- Supplier selection followed by one `Connect` action.
- One progressively disclosed outreach panel with independent Link, SMS and
  Email choices, followed by one `Send` action.
- One comparison and selection decision.
- One current milestone in Deploy.

Internal lifecycle complexity must not become additional buyer buttons.

## Integration Sequence

1. Freeze the streamlined screen contract and create one integration branch.
2. Simplify the public landing without changing workflow behavior.
3. Simplify Find intake and recommendation review.
4. Preserve exactly three explainable matches and add the clear Connect
   transition.
5. Implement multi-channel outreach and the concise supplier response.
6. Preserve comparison, commitment payment and lightweight Deploy.
7. Certify the complete journey twice on desktop and mobile.
8. Remove frozen donor surfaces only after canonical tests no longer depend on
   them.
