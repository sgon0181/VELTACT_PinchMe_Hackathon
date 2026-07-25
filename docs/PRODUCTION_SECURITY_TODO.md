# Production Security TODO

This hackathon demo may use local sandbox credentials for speed. Before shipping beyond a demo, complete this checklist.

## Secrets

- Rotate any Pinch credentials that were shared in chat, docs, screenshots, terminals, or demos.
- Remove all real credentials from repository history if any were accidentally committed.
- Store secrets in a managed secret store or deployment environment variables.
- Keep `.env` files ignored and never commit them.
- Use separate credentials for local development, staging, and production.

## Pinch

- Replace sandbox Pinch credentials with live credentials only in the production environment.
- Confirm the production `PINCH_API_BASE_URL` and API version with Pinch before launch.
- Configure the production return URL on the real application domain.
- Configure the production webhook URL on the real application domain.
- Verify webhook signatures using the production `PINCH_WEBHOOK_SECRET`.
- Reject unsigned, stale, replayed, or malformed webhook requests.

## Application

- Replace scoped buyer capability tokens with account login, organisation membership, role-based authorization and secure session management.
- Replace curated supplier verification with legal identity, licence, insurance and KYC verification.
- Replace the single-process JSON snapshot with a transactional database before horizontal scaling.
- Export marketplace audit events to an immutable external audit store.
- Add structured server logging that redacts secrets, bearer tokens, webhook signatures, and payment identifiers.
- Replace the in-process API rate limiter with a distributed limiter at the gateway or shared data layer.
- Add request size limits and validation for all public endpoints.
- Add monitoring and alerting for payment failures, webhook failures, and suspicious request patterns.

## Deployment

- Enforce HTTPS everywhere.
- Restrict CORS to production frontend origins.
- Review dependency vulnerability reports before release.
- Run lint, typecheck, build, and integration tests in CI before deploys.
- Document credential rotation and incident response steps.
