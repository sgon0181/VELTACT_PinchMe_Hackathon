# Veltact Staging Deployment

## Purpose

Deploy the canonical Veltact buyer, supplier, API, Socket.IO and Pinch webhook
surfaces as one HTTPS Node service. Staging is verified before any
`veltact.com` DNS change.

The checked-in `render.yaml` provisions one Render web service in Singapore and
a persistent disk for the current JSON repository. The disk is suitable for a
controlled staging demo, not a multi-instance production architecture.

## Create The Service

1. Push the staging integration branch.
2. In Render, choose **New > Blueprint** and connect this repository.
3. Review `render.yaml`.
4. Enter every environment value marked `sync: false`.
5. Deploy without attaching the production domain.
6. Record the assigned HTTPS origin.
7. Set `WEB_ORIGIN`, `PUBLIC_BASE_URL`, `API_PUBLIC_URL` and
   `PINCH_RETURN_URL` to that exact origin, then redeploy.

The return URL is:

```text
https://YOUR-STAGING-ORIGIN/api/pinch/return
```

The webhook URL is:

```text
https://YOUR-STAGING-ORIGIN/api/pinch/webhooks
```

## Provider Values

Configure:

- Pinch sandbox client, secret, auth URL, API base URL and webhook secret.
- OpenAI API key.
- A verified Resend sender and API key.
- Twilio account SID, auth token and sending number.
- Controlled demo recipient overrides for email and SMS.

Recipient overrides prevent staging outreach from contacting discovered
businesses. Remove them only after consent and production outreach controls are
in place.

Do not commit provider values. Confirm readiness through `/api/health`; do not
infer readiness from the presence of environment variable names.

## Release Verification

Run locally from a clean checkout:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Verify on staging:

- `/api/health` returns `status: ok`.
- `/`, `/index.html` and a tokenised `/supplier.html` load over HTTPS.
- Supplier URLs in delivered email and SMS use the staging origin.
- A supplier response updates the correct buyer workspace.
- Pinch opens a real sandbox-hosted checkout.
- Browser return alone does not secure the supplier.
- Verified webhook or reconciliation evidence secures the engagement.
- The commitment-confirmed email sends once.
- Workspace state survives a Render restart.

## Production Cutover

Do not point `veltact.com` at staging. Production cutover requires a separate
review of authentication, durable data, backups, sender consent, rate limits,
monitoring and rollback. Preserve existing Google Workspace MX and TXT records
when website DNS is eventually changed.
