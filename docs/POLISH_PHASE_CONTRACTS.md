# Polish Phase Contracts

This file defines the minimum coordination contracts for the next polish phase. It does not expand the locked RapidMatch workflow in `docs/DEMO_BLUEPRINT.md`.

## Guardrail

Email, SMS and AI intake are supporting capabilities only. They must improve this path:

Buyer need -> Need Profile -> matched suppliers -> outreach -> supplier response -> comparison -> Pinch payment.

They must not become separate messaging, chatbot, analytics, authentication, scraping or project-management products.

## Supplier Outreach Delivery

Shared type: `SupplierOutreachDelivery`.

Minimum fields:

- `invitationId`
- `supplierId`
- `channel`: `email` or `sms`
- `destination`
- `deliveryStatus`: `not_sent`, `queued`, `sent`, or `failed`
- `sentAt`
- `errorMessage`

Rules:

- Do not show `sent` unless a backend provider call or local demo adapter confirms it.
- Do not fake SMS or email delivery in the production path.
- Secure supplier links remain the fallback if provider setup fails.
- Outreach UI must preserve viewed/responded supplier states separately from delivery states.

Socket event reserved for delivery updates:

- `rapidmatch:outreach.delivery_updated`

## AI Intake

Shared type: `AiIntakeResult`.

Minimum fields:

- `rawRequirement`
- `generatedProfile`
- `confidence`
- `missingFields`

Generated profile fields:

- `title`
- `problemSummary`
- `category`
- `equipmentOrTechnology`
- `requiredCapabilities`
- `location`
- `urgency`
- `budgetRange`
- `certificationsOrConstraints`
- `buyerPriority`

Rules:

- AI structures the requirement; it must not claim to diagnose the machine.
- The buyer must review the generated Need Profile before outreach.
- Manual intake must remain available.
- Missing fields should be explicit instead of hallucinated.

Socket event reserved for AI intake completion:

- `rapidmatch:ai_intake.structured`

## Agent Ownership

- A0 owns contracts, truth of claims and integration review.
- A1 owns Need Profile and matching data quality.
- A2 owns buyer intake, outreach and comparison UX.
- A3 owns supplier links, response UX and realtime events.
- A4 owns Pinch payment and secured-state reliability.
- A5 owns visual polish and demo presentation quality without adding scope.
