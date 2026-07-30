# Veltact Integration Contract

## Authority

`@veltact/contracts` owns public wire schemas, route templates and Socket.IO
event names. Agents may consume these contracts but may not create competing
public types, routes or events without A0 review.

RapidMatch is the canonical namespace. V2 contracts remain available only while
donor capabilities are migrated.

## Canonical Aggregate

`RapidMatchBuyerWorkspace` is the buyer-facing aggregate:

- `phase`: `find | connect | deploy`
- `status`: aggregate journey state
- `nextAction`: the single primary buyer action
- `needProfile`
- `intakeEvidence`
- `researchResult`
- `solutionDecision`
- `discoveredSuppliers`
- `suppliers`
- `matches`
- `invitations`
- `outreachDeliveries`
- `responses`
- `engagement`
- `deployment`

The aggregate does not replace domain records. Need Profile, invitation,
response, engagement and payment statuses remain authoritative.

## Find Contracts

- `AiIntakeEvidence`: written, PDF or photo evidence accepted by AI intake.
- `IntakeEvidenceSummary`: safe workspace projection without file contents.
- `AiIntakeResult`: raw requirement, generated fields, confidence and missing
  fields.
- `SolutionResearchResult`: overview, cited approaches, missing information and
  safety notice.
- `SolutionDecision`: selected approaches and `local_trial | hybrid |
  outsource` decision.

User-facing outcomes map as:

- `Download report` -> no lifecycle transition
- `Find suppliers` -> `outsource`
- Legacy `Use this plan internally` -> `local_trial`
- A future combined execution path may use `hybrid`

## Connect Contracts

- `Supplier`
- `SupplierLead`
- `SupplierMatch`
- `SupplierInvitation`
- `SupplierOutreachDelivery`
- `SupplierProfile`
- `SupplierResponse`

`SupplierResponse` may include:

- Availability.
- Indicative price.
- Relevant experience.
- Proposed approach.
- Assumptions.
- Conditions.

Public discovery produces `SupplierLead` evidence. It does not create a trusted
`Supplier`. Buyer outreach approval and supplier confirmation remain separate
backend records, even when the supplier UI completes confirmation and response
from one screen.

Invitation requests select supplier lead IDs and zero or more delivery
channels. An empty channel list creates copyable links without making an
external delivery attempt. Omitted channels preserve the existing configured
default during migration.

The canonical buyer interaction may select both `email` and `sms` in one
request. `Link` is a UI choice, not an `OutreachChannel`: selecting it requests
copyable invitation links and adds no provider channel to
`deliveryChannels`.

## Deploy Contracts

- `Engagement`: selected supplier and Pinch commercial state.
- `PaymentStatus`: backend payment lifecycle.
- `DeploymentSummary`: lightweight project projection.
- `DeploymentMilestoneSummary`: at most four ordered demo milestones, each with
  its own amount, hosted-link state and payment evidence.

`DeploymentSummary.progressPercentage` must be derived from milestone state.
Payment may fund a milestone but cannot mark engineering work complete.
Only the first incomplete milestone can create a Payment Link. The first
milestone is the supplier commitment; later milestones reuse the same Pinch
link, webhook and reconciliation machinery without re-running supplier
selection. Each link carries `milestoneId`, `serviceFeeMinor` and
`serviceFeeDisclosed: true` metadata.

The service-fee amount is disclosed as an allocation within the milestone
amount. The interface and API do not claim fee settlement or commission
collection. A pending unpaid link may be cancelled through the provider; a paid
milestone cannot be reverted without a separately verified refund lifecycle.

The canonical buyer aggregate does not expose V2 task, issue, document,
approval or change-request collections.

## Canonical Routes

Route templates are exported as `rapidMatchApiRoute`.

### Find

- `POST /api/ai-intake/structure`
- `POST /api/need-profiles`
- `GET /api/need-profiles/:needProfileId`
- `POST /api/need-profiles/:needProfileId/research`
- `POST /api/need-profiles/:needProfileId/solution-decision`
- `GET /api/need-profiles/:needProfileId/report.pdf`

### Connect

- `POST /api/need-profiles/:needProfileId/suppliers/discover`
- `POST /api/need-profiles/:needProfileId/invitations/send`
- `GET /api/need-profiles/:needProfileId/responses`
- `GET /api/supplier-invitations/:token`
- `POST /api/supplier-invitations/:token/claim`
- `POST /api/supplier-invitations/:token/responses`
- `GET /api/supplier-invitations/:token/rfq.pdf`
- `GET /api/supplier-invitations/:token/quote.pdf`
- `POST /api/need-profiles/:needProfileId/engagements`

### Deploy

- `GET /api/engagements/:engagementId`
- `GET /api/engagements/:engagementId/receipt`
- `POST /api/engagements/:engagementId/payment-link`
- `POST /api/engagements/:engagementId/milestones/:milestoneId/payment-link`
- `POST /api/engagements/:engagementId/milestones/:milestoneId/payment-link/cancel`
- `GET /api/engagements/:engagementId/deployment`
- `PATCH /api/engagements/:engagementId/deployment/milestones/:milestoneId`
- `GET /api/engagements/:engagementId/commitment-notification`
- `POST /api/pinch/webhooks`

### Development

- `POST /api/demo/reset`

The reset response must identify one canonical buyer workspace and at least two
supplier invitation paths for comparison. All fixture records remain labelled.

### Release Readiness

- `GET /api/health`

The health response is the operational authority for a deployed demo:

- `releaseRevision`: the deployed Git revision, or `local` outside a release.
- `providerModes.research`: `auto | openai | fixture`.
- `providerModes.email`: `local_demo | resend | sendgrid`.
- `providerModes.sms`: `none | local_demo | twilio`.
- `providerModes.payment`: `local_demo | pinch`.
- `readiness`: capability booleans without credentials, destinations or tokens.

Release tooling must compare `releaseRevision` with the intended commit before
running a browser rehearsal. A readiness boolean does not change the provider
mode: for example, ready `local_demo` email still means that no external email
was sent.

Routes not already implemented are reserved by this contract. Implementations
must use these names rather than adding `/api/v3`, `/api/unified` or additional
V2 endpoints.

## Buyer Authorization

Every buyer route after Need Profile creation requires the scoped capability
header when capability authorization is enabled:

```http
x-veltact-buyer-token: <issued token>
```

Only a token hash is persisted. The raw token may appear in the initial buyer
URL, then must be removed from the visible URL and retained by the buyer client.

## Supplier Authorization

The invitation token authorizes one supplier to view and respond to one
requirement. It expires and must not appear in logs.

Supplier claim and response are separate API transitions. The frontend may
present them as one concise form when both complete successfully.

## RapidMatch Socket.IO Events

Join and leave:

- `rapidmatch:need.join`
- `rapidmatch:need.leave`

Find:

- `rapidmatch:ai_intake.structured`
- `rapidmatch:research.updated`
- `rapidmatch:solution_decision.updated`

Connect:

- `rapidmatch:match.created`
- `rapidmatch:supplier.discovery_updated`
- `rapidmatch:invitation.sent`
- `rapidmatch:outreach.delivery_updated`
- `rapidmatch:response.submitted`
- `rapidmatch:supplier.selected`

Deploy:

- `rapidmatch:payment.status_updated`
- `rapidmatch:engagement.secured`
- `rapidmatch:deployment.updated`

Join payloads include `needProfileId` and, when required,
`buyerAccessToken`.

Agents must not emit canonical workflow updates under `veltact:v2:*`.

## Integration Invariants

- One Need Profile ID links Find, Connect and Deploy.
- Research carries source and citation provenance.
- AI output remains buyer-reviewed.
- Discovery never triggers outreach.
- Buyer approval precedes supplier contact.
- A copy-link action does not claim provider delivery.
- Supplier confirmation precedes activation.
- At least two deterministic responses support the guided comparison.
- Selection requires a submitted `can_help` response.
- One selected response creates one engagement.
- Payment Link creation reuses an existing usable link.
- Milestone Payment Links are sequential and cannot skip incomplete work.
- Every milestone stores its own provider, link, payment and evidence IDs.
- The engagement receipt is a read-only projection of persisted lifecycle
  timestamps. It labels the industry baseline as a general claim and renders
  incomplete payment or milestone steps as pending.
- Local-demo outreach is recorded as prepared, not sent. Local-demo payment is
  recorded as non-authoritative, not Pinch-verified.
- Unpaid-link cancellation calls the configured provider before local state
  changes.
- Browser return does not update authoritative payment state.
- Only verified webhook or reconciliation evidence secures the supplier.
- Commitment notification is idempotent and follows authoritative payment
  evidence.
- Commitment notification never claims supplier settlement.
- Deployment progress is derived and cannot be advanced by payment alone.
- Fixture and local-demo evidence remain visible.
- Buyer and supplier controls remain separated by capability.

## Environment Conventions

- Secrets belong in `apps/api/.env` or a deployment secret store.
- `MARKETPLACE_DATA_FILE` is the canonical journey repository.
- `VELTACT_V2_DATA_FILE` is migration-only.
- `SUPPLIER_CATALOG_FILE` controls validated catalog data.
- `PUBLIC_BASE_URL` is canonical for supplier and Pinch return links.
- `RENDER_GIT_COMMIT` supplies the deployed revision on Render.
- `VELTACT_RELEASE_SHA` may supply the revision on another host.
- `BUYER_CAPABILITY_AUTH_REQUIRED` defaults to true in production.
- `VELTACT_RESEARCH_PROVIDER=auto|openai|fixture` selects research behavior.
- `OPENAI_API_KEY` enables live intake/research.
- `VELTACT_DISCOVERY_PROVIDER=auto|openai|perplexity|fixture` independently
  selects supplier discovery; auto prefers OpenAI, then Perplexity, then
  labelled fixtures.
- `PERPLEXITY_API_KEY` enables the optional Sonar supplier-discovery adapter.
- `FIRECRAWL_API_KEY` enables optional discovery fallback.
- `VELTACT_SERVICE_FEE_BPS` configures the disclosed milestone fee allocation
  and defaults to `500` (5%).
- Resend or SendGrid provides email.
- Twilio provides SMS or WhatsApp.
- `WEB_ORIGIN` and `PUBLIC_BASE_URL` must identify the API-served public origin.

Delivery state semantics:

- `not_sent`: no provider attempt.
- `queued`: accepted for asynchronous processing.
- `sent`: provider accepted delivery.
- `failed`: an attempted delivery failed.
- Missing configuration is reported as unavailable readiness, not a fabricated
  delivery attempt.

## Agent File Ownership

- A0: `packages/contracts`, root configuration, product/architecture/integration
  documents and final route registration.
- A1: RapidMatch marketplace store, persistence, research/discovery services and
  API implementation.
- A2: canonical buyer UI based on `apps/buyer/src/main.ts`.
- A3: supplier page, outreach adapters and canonical realtime behavior.
- A4: Pinch/payment modules and lightweight deployment projection.
- A5: public landing, loading treatment, brand assets and global design tokens.
- A6: account pages and isolated staging authentication.

Cross-owner edits require A0 integration review.

## Canonical Demo Sprint

The active integration branch is `codex/canonical-demo-flow`, created from
`origin/main` commit `5376b0c`. Historical A1-A6 branches are evidence of prior
work, not merge inputs for this sprint.

Agents do not update automatically. Before each assignment, A0 supplies the
latest integration SHA. The agent must:

1. Fetch `origin`.
2. Confirm its worktree is clean.
3. Create a fresh task branch from the supplied
   `origin/codex/canonical-demo-flow` SHA.
4. Read the active product, blueprint, architecture and integration documents.
5. Change only its owned files.
6. Run its focused tests plus lint, typecheck and build.
7. Commit and push without merging.

A0 reviews and integrates one workstream at a time. No agent merges directly
into `main`, `Recurssion` or `codex/canonical-demo-flow`. Do not merge or rebase
an old agent branch into the sprint.

Integration order:

1. A5 landing simplification.
2. A2 Find intake and recommendation review.
3. A1 supplier matching and Connect preparation.
4. A3 multi-channel outreach, supplier response and realtime status.
5. A4 commitment and lightweight Deploy.
6. A6 complete journey certification.
7. A0 legacy-surface removal after parity.

Only one workstream may edit `apps/buyer/src/main.ts` at a time. A5 must remain
within landing assets during its first pass; A6 adds tests and release evidence
without redesigning product surfaces.
