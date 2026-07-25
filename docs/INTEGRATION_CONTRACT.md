# Veltact Integration Contract

## Shared Contracts

`@veltact/contracts` is the only owner of public status enums and wire schemas.
It includes the original RapidMatch types plus:

- `MarketplaceNeedProfile`, `NeedProfile` and `AiIntakeResult`
- `Supplier`, `SupplierCatalogEntry`, `SupplierMatch`,
  `SupplierInvitation`, `SupplierOutreachDelivery` and `SupplierResponse`
- `Engagement`, `PaymentStatus` and `MarketplaceAuditEvent`
- `SolutionApproach`, `ResearchCitation`, `SolutionResearchResult` and
  `SolutionDecision`
- `SupplierLead`, `SupplierClaim`, `SupplierProfile` and
  `SupplierCommercialResponse`
- `IndustrialProject`, `ProjectMilestone`, `ProjectTask`, `ProjectDependency`,
  `ProjectActivity`, `ProjectRisk`, `ProjectIssue`, `ProjectApproval`,
  `ProjectDocument`, `ProjectChangeRequest` and `ProjectContact`
- `PaymentEvidence`

API-internal records may add storage aliases, but public fields and status enums
must derive from these contracts.

## RapidMatch V1 Routes

- `POST /api/need-profiles`
- `GET /api/need-profiles/:needProfileId`
- `GET /api/need-profiles/:needProfileId/responses`
- `POST /api/need-profiles/:needProfileId/invitations/send`
- `POST /api/need-profiles/:needProfileId/engagements`
- `GET /api/engagements/:engagementId`
- `POST /api/engagements/:engagementId/payment-link`
- `GET /api/supplier-invitations/:token`
- `POST /api/supplier-invitations/:token/responses`

## Find, Connect, Deploy V2 Routes

Buyer-scoped:

- `POST /api/v2/needs`
- `GET /api/v2/needs/:needId`
- `POST /api/v2/needs/:needId/research`
- `POST /api/v2/needs/:needId/solution-decision`
- `POST /api/v2/needs/:needId/suppliers/discover`
- `POST /api/v2/needs/:needId/suppliers/approve-outreach`
- `POST /api/v2/needs/:needId/invitations/send`
- `POST /api/v2/needs/:needId/suppliers/:supplierLeadId/buyer-approve`
- `POST /api/v2/needs/:needId/suppliers/:supplierLeadId/activate`
- `POST /api/v2/needs/:needId/responses/:supplierResponseId/select`
- `PATCH /api/v2/projects/:projectId/tasks/:taskId`
- `POST /api/v2/projects/:projectId/milestones/:milestoneId/accept`
- `POST /api/v2/projects/:projectId/milestones/:milestoneId/payment-link`
- `POST /api/v2/projects/:projectId/milestones/:milestoneId/reconcile`
- `POST /api/v2/projects/:projectId/milestones/:milestoneId/demo-payment`
- `POST /api/v2/projects/:projectId/change-requests`

Supplier-token scoped:

- `GET /api/v2/supplier-claims/:token`
- `POST /api/v2/supplier-claims/:token/profile`
- `POST /api/v2/supplier-claims/:token/response`

Development only:

- `POST /api/v2/demo/reset`

The public landing page may call the reset route only after `GET /api/health`
reports a non-production environment. A successful reset returns one
buyer-capability URL and one supplier-claim URL for the same seeded requirement.
The UI must present the buyer URL first and describe the supplier URL as a
private invitation, not a second public product entry.

When capability authorization is enabled, every buyer route after creation
requires:

```http
x-veltact-buyer-token: <issued token>
```

The supplier claim token is the capability credential for one organisation and
one requirement. It expires and must not be logged or shared.

## Supporting Routes

- `POST /api/ai-intake/structure`: structure evidence without diagnosing
  equipment.
- `POST /api/pinch/webhooks`: accept only verified Pinch events.
- `GET /api/health`: report non-secret provider and runtime readiness.
- `POST /api/demo/reset` and simulated-payment routes: non-production controls.

## Socket.IO Events

RapidMatch V1:

- `rapidmatch:need.join`
- `rapidmatch:need.leave`
- `rapidmatch:invitation.sent`
- `rapidmatch:outreach.delivery_updated`
- `rapidmatch:ai_intake.structured`
- `rapidmatch:response.submitted`
- `rapidmatch:supplier.selected`
- `rapidmatch:payment.status_updated`
- `rapidmatch:engagement.secured`

Find, Connect, Deploy V2:

- `veltact:v2:need.join`
- `veltact:v2:need.leave`
- `veltact:v2:research.updated`
- `veltact:v2:discovery.updated`
- `veltact:v2:supplier.lifecycle_updated`
- `veltact:v2:supplier.response_submitted`
- `veltact:v2:project.updated`
- `veltact:v2:milestone.payment_updated`

Join payloads include `needProfileId` and, when authorization is enabled,
`buyerAccessToken`.

## Integration Invariants

- Research and supplier discovery carry provider and citation provenance.
- Supplier discovery never triggers outreach.
- Only `approved_for_outreach` leads can be invited.
- Supplier approval and buyer approval are separate state transitions.
- Project creation requires selection of an active supplier response.
- Milestone dependencies and acceptance are enforced by the API.
- Payment Link creation reuses an existing usable milestone link.
- Browser return URLs do not write authoritative payment state.
- Fixture and local-demo evidence must remain visibly labelled.
- Public navigation starts with the buyer journey; supplier access remains
  scoped to an invitation token.
- Buyer and supplier surfaces may render the same lifecycle state but must not
  share role-specific controls.

## Environment Conventions

- Secrets belong only in `apps/api/.env` or a deployment secret store.
- `MARKETPLACE_DATA_FILE` controls durable single-process V1 state.
- `VELTACT_V2_DATA_FILE` controls durable V2 state.
- `SUPPLIER_CATALOG_FILE` controls validated external supplier data.
- `PUBLIC_BASE_URL` is canonical for claim and payment-return URLs.
- `BUYER_CAPABILITY_AUTH_REQUIRED` defaults to true in production.
- `VELTACT_RESEARCH_PROVIDER=auto|openai|fixture` selects research behavior.
- `OPENAI_API_KEY` enables live research; `FIRECRAWL_API_KEY` enables optional
  discovery fallback.
- Delivery becomes `sent` only after provider acceptance.
- `WEB_ORIGIN` and `PUBLIC_BASE_URL` must use the API-served public origin before
  external links are generated.
