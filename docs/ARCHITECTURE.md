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
commitment -> secured -> delivery progress`

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
- Pinch, OpenAI, Firecrawl, Resend, SendGrid and Twilio: backend-only provider
  boundaries.

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
- `marketplace/outreachDelivery.ts`: controlled email, SMS and WhatsApp
  adapters.
- V2 supplier discovery: donor provider/provenance logic, mapped into canonical
  supplier candidates before buyer approval.
- `realtime.ts`: canonical RapidMatch buyer updates.

The supplier UI may combine profile consent and quote submission into one
screen. Backend consent and response records remain distinct.

Invitation creation and external delivery remain separate operations. Copying a
link creates no fabricated delivery record. RFQ and quote exports are generated
from persisted canonical records.

### Deploy

- `payments/*` and `pinch/*`: payer, hosted Payment Link, webhook verification
  and reconciliation.
- Existing RapidMatch `Engagement`: commercial root after supplier selection.
- V2 project templates and payment evidence: donor logic used to create a
  minimal deployment summary.

The canonical Deploy contract exposes the commitment, milestones and progress,
not the full V2 task, issue, document, approval and change-request surface.

## Data Ownership

`MARKETPLACE_DATA_FILE` is the target canonical repository.

During migration, `VELTACT_V2_DATA_FILE` remains readable only by migration-only
V2 routes. New canonical journey features must persist under the RapidMatch
repository. No user-facing workflow may require coordinated reads from both
stores.

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
- Firecrawl or OpenAI web search may return supplier candidate evidence.
- Discovery never triggers outreach or enrolment.
- Buyer approval is required before contact.
- Supplier confirmation is required before activation.
- Deterministic fixtures remain visibly labelled.
- Delivery is `sent` only after provider acceptance.
- An unavailable provider is `not configured`, not a failed attempt.
- Browser return never confirms Pinch payment.
- Only verified webhook or reconciliation evidence is authoritative.
- Local demo payment evidence is not a Pinch transaction.

## UI Constraint

The canonical frontend preserves RapidMatch's interaction density:

- One primary next action per state.
- Progressive disclosure for citations and evidence.
- One selected solution and two outcomes at the end of Find.
- Supplier selection plus one explicit outreach channel in Connect.
- One comparison and selection decision.
- One current milestone in Deploy.

Internal lifecycle complexity must not become additional buyer buttons.

## Integration Sequence

1. Freeze product, contracts, routes and events.
2. Add research and decision records to the RapidMatch repository.
3. Extend the RapidMatch buyer UI with Find.
4. Map provenance-aware discovery into RapidMatch matching and outreach.
5. Simplify the supplier consent and response surface.
6. Add deterministic two-response comparison.
7. Attach the existing Pinch engagement to lightweight deployment progress.
8. Redirect the public product entry to the unified RapidMatch journey.
9. Retire V2 only after canonical end-to-end acceptance.
