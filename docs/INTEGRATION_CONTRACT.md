# Veltact Integration Contract

## Shared Contracts

`@veltact/contracts` owns:

- `MarketplaceNeedProfile`
- `NeedProfile`
- `Supplier` and `SupplierCatalogEntry`
- `SupplierMatch`
- `SupplierInvitation`
- `SupplierOutreachDelivery`
- `SupplierResponse`
- `Engagement`
- `PaymentStatus`
- `AiIntakeResult`
- `MarketplaceAuditEvent`

API-internal records may add storage aliases, but status enums and public fields must derive from these contracts.

## Buyer Routes

- `POST /api/need-profiles`: create the requirement, matches and invitations; returns `buyerAccessToken`.
- `GET /api/need-profiles/:needProfileId`: load buyer state.
- `GET /api/need-profiles/:needProfileId/responses`: load comparable responses.
- `POST /api/need-profiles/:needProfileId/invitations/send`: attempt parallel delivery.
- `POST /api/need-profiles/:needProfileId/engagements`: select one submitted `can_help` response.
- `GET /api/engagements/:engagementId`: reconcile and load engagement state.
- `POST /api/engagements/:engagementId/payment-link`: create or return the hosted checkout.

When capability authorization is enabled, every route after creation requires:

```http
x-veltact-buyer-token: <issued token>
```

## Supplier Routes

- `GET /api/supplier-invitations/:token`: open one supplier opportunity.
- `POST /api/supplier-invitations/:token/responses`: submit or update one standardised response while the requirement remains open.

The invitation token is the supplier's capability credential for that opportunity. It must not be logged or shared with another supplier.

## Supporting Routes

- `POST /api/ai-intake/structure`: structure buyer evidence without diagnosing equipment.
- `POST /api/pinch/webhooks`: accept only verified Pinch events.
- `GET /api/health`: report non-secret provider and runtime readiness.
- `POST /api/demo/reset` and `POST /api/engagements/:id/demo-payment`: non-production demo controls.

## Socket.IO Events

- Join: `rapidmatch:need.join`
- Leave: `rapidmatch:need.leave`
- Invitation state: `rapidmatch:invitation.sent`
- Delivery state: `rapidmatch:outreach.delivery_updated`
- AI intake: `rapidmatch:ai_intake.structured`
- Supplier response: `rapidmatch:response.submitted`
- Supplier selected: `rapidmatch:supplier.selected`
- Payment state: `rapidmatch:payment.status_updated`
- Secured engagement: `rapidmatch:engagement.secured`

The join payload includes `needProfileId` and, when authorization is enabled, `buyerAccessToken`.

## Environment Conventions

- Secrets belong only in `apps/api/.env` or a deployment secret store.
- `MARKETPLACE_DATA_FILE` controls durable single-process state.
- `SUPPLIER_CATALOG_FILE` controls validated external supplier data.
- `BUYER_CAPABILITY_AUTH_REQUIRED` defaults to true in production.
- Provider delivery is only `sent` after the backend adapter receives provider acceptance.
- `WEB_ORIGIN` must be the public API-served origin before invitation links are generated.
