# Hackathon Disclosure

## What Is Implemented

- Buyer RapidMatch workflow for submitting an industrial requirement and reviewing a structured Need Profile.
- Optional OpenAI-backed intake structuring with a deterministic local fallback. The intake wrapper does not claim to diagnose machinery.
- Deterministic supplier matching with explainable reasons and domain-specialism signals.
- A validated seven-supplier demo catalog, including robotics specialists, with support for loading an external catalog from `SUPPLIER_CATALOG_FILE`.
- Unique supplier invitation links and standardised supplier response submission.
- Backend email delivery through Resend or SendGrid, SMS through Twilio, and WhatsApp through the Twilio Sandbox when configured.
- Honest per-channel delivery states: `not_sent`, `queued`, `sent`, and `failed`.
- Live supplier invitation, outreach, response, payment and secured-state events through Socket.IO.
- Buyer response comparison, supplier selection and backend-owned engagement creation.
- Pinch sandbox payer and hosted Payment Link creation.
- Verified Pinch webhook and API reconciliation paths that authoritatively transition an engagement to `supplier_secured`.
- Atomic file-backed marketplace snapshots and durable audit events for the supported single-process demo deployment.
- Production-default buyer capability authorization, scoped supplier invitation tokens, API rate limits and restricted development-only payment utilities.
- V2 cited solution approaches with local, outsource or hybrid buyer decisions.
- Buyer-reviewed supplier discovery with source evidence and an optional Firecrawl fallback.
- Backend-enforced supplier claim, profile approval, buyer approval and activation lifecycle.
- PLC recovery and robotic integration project templates with milestones, dependencies, tasks, acceptance criteria, risks, approvals, contacts, activity, documents and change requests.
- Project and milestone metadata in Pinch Payment Links, with verified payment evidence kept separate from engineering completion.

## Demo Constraints

- The default persistence layer is a local JSON snapshot intended for a single API process. A multi-instance production deployment requires a transactional database and shared locking.
- `local_demo` email confirms application behavior but does not send externally. Resend, SendGrid, Twilio SMS and Twilio WhatsApp only report `sent` after the configured provider accepts the request.
- Seeded supplier verification means curated demo-catalog verification, not completed legal identity, insurance, licence or KYC verification.
- Buyer capability tokens protect individual requirements in production mode. User/password accounts, organisation membership and role administration are not part of the hackathon workflow.
- The buyer uses Socket.IO for live updates and polling as a resilience fallback.
- Payment success is not inferred from the browser redirect. The final secured state comes from backend-verified payment evidence. A local-only demo payment route remains available outside production.
- Fixture supplier leads are fictional and visibly labelled; they are not live web discoveries or verified businesses.
- The V2 project layer is a focused demo implementation, not a general CRM or production project-management system.

## Credentials

- No credentials are tracked in the repository.
- Local `.env` files are ignored.
- Provider readiness can be checked without exposing values at `GET /api/health`.
- Operators must configure valid Pinch, OpenAI, email and Twilio credentials and destinations in their deployment environment.

## Not Production Ready

- Replace the local snapshot with a transactional database before running multiple API instances.
- Add account login, organisation-level authorization, password recovery and session management before opening the buyer product publicly.
- Complete supplier onboarding, legal identity verification and KYC rather than relying on curated demo verification.
- Move audit events to an immutable external audit store and use a distributed rate limiter.
- Complete production monitoring, secret rotation, incident response, Pinch operational controls and provider-domain verification.
