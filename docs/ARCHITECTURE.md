# Veltact Architecture

## Product Boundary

RapidMatch owns one workflow:

Buyer need -> Need Profile -> supplier matches -> parallel outreach -> supplier response -> comparison -> selection -> Pinch payment -> supplier secured.

AI intake and email, SMS or WhatsApp delivery support this workflow. They are not separate products.

## Runtime

- `apps/buyer`: static TypeScript buyer application plus the token-scoped supplier response page.
- `apps/api`: single Express and Socket.IO process that owns marketplace state transitions and provider calls.
- `packages/contracts`: shared Zod schemas, TypeScript types and Socket.IO event names.
- Pinch, OpenAI, Resend, SendGrid and Twilio are backend-only provider boundaries.

The API serves the compiled buyer assets. The supported demo deployment is one API process.

## Marketplace Modules

- `marketplaceRoutes.ts`: HTTP validation, authorization and wire serialization.
- `store.ts`: authoritative state transitions, buyer capability checks and audit events.
- `persistence.ts`: atomic versioned snapshots for restart recovery.
- `matching.ts`: deterministic explainable scoring.
- `suppliers.ts`: validated supplier catalog loading and curated demo fallback.
- `outreachDelivery.ts`: email and mobile provider adapters.
- `realtime.ts`: buyer-scoped live state notifications.
- `payments/*` and `pinch/*`: payment-provider boundary, hosted Payment Link and verified payment evidence.

## State And Audit

`MARKETPLACE_DATA_FILE` defaults to `apps/api/.data/marketplace.json` outside tests. Every authoritative mutation writes a versioned snapshot through a temporary file and atomic rename.

The snapshot contains needs, invitation state, delivery state, responses, engagements, processed Pinch event IDs, payment evidence and the most recent 1,000 marketplace audit events.

This is durable for the supported single-process demo. Multi-process or multi-instance deployment requires a transactional shared database.

## Access Boundaries

- Production defaults to buyer capability authorization.
- A random 256-bit buyer token is returned once when a requirement is created; only its SHA-256 hash is persisted.
- Buyer routes and Socket.IO room joins are scoped with `x-veltact-buyer-token`.
- A separate random 256-bit invitation token scopes a supplier to one opportunity.
- Supplier opportunity responses exclude every other supplier's invitation token.
- Pinch webhooks require a valid timestamped signature.
- Development-only reset, simulated payment and raw Pinch utility routes are unavailable in production.
- In-process rate limits protect API and AI intake routes.

Capability authorization is not a user account system. Production accounts, organisation roles and supplier KYC remain future infrastructure.

## Supplier Catalog

The built-in catalog contains seven curated demo suppliers, including robotics specialists. `SUPPLIER_CATALOG_FILE` can replace it with a JSON array only when every record validates against `SupplierCatalogEntry`.

`demo_verified` means curated demo evidence, not legal identity or KYC verification.
