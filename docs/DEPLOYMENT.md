# Veltact Live Demo Deployment

## Purpose

`https://veltact.com` runs the canonical Find, Connect and Deploy journey as one
free Render Node service. Express serves the landing page, buyer workspace,
supplier workspace, API, Socket.IO updates and explicit local-demo payment
flow from the same origin.

This is a public product demonstration, not a production marketplace.

## Live Demo Mode

The checked-in `render.yaml` intentionally:

- deploys the `Recurssion` branch to the existing `veltact` service;
- keeps the service on Render's free plan;
- uses deterministic fixture research while preserving the OpenAI adapter;
- prepares clearly labelled local-demo email and SMS delivery evidence without
  contacting external recipients;
- uses clearly labelled, non-authoritative local-demo payment evidence;
- requires no OpenAI, Resend, Twilio or Pinch secrets;
- keeps `veltact.com` as the origin for every buyer and supplier link.

The API health response is the authority for demo controls. The interface must
not describe local-demo outreach as externally delivered or local-demo payment
evidence as a Pinch transaction.

## Deploy

Render automatically deploys pushed commits from `Recurssion`.

1. Run the complete local release gate.
2. Push the verified commit to `origin/Recurssion`.
3. Wait for `https://veltact.com/api/health` to return HTTP 200.
4. Confirm `releaseRevision` matches the pushed commit.
5. Confirm `providerModes` matches the claims planned for the rehearsal.
6. Confirm the landing page and buyer workspace contain the new release.
7. Run the complete live buyer and supplier journey twice.

Local release gate:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

## Live Acceptance

Verify:

- `/`, `/index.html`, `/signin.html` and `/create-account.html` load over HTTPS;
- a fresh requirement produces one structured Need Profile;
- research produces exactly three solution pathways;
- a selected-path PDF downloads before the outsource decision;
- supplier discovery returns explainable ranked suppliers;
- local-demo email and SMS prepare working tokenised supplier links;
- two separate suppliers can claim and submit standardised quotes;
- the buyer receives both responses and compares them;
- selecting one supplier creates only one engagement;
- local-demo payment remains explicitly non-authoritative;
- recording local-demo evidence secures the supplier for demonstration;
- Deploy begins with Site Assessment / Scoping Visit and zero engineering
  completion;
- desktop and mobile views have no blocking overlap or horizontal overflow.

## Free-Tier Limitations

- The service can take time to wake after inactivity.
- JSON state is stored on an ephemeral filesystem and can reset after a restart
  or redeploy.
- Minimal account pages exist, but the public guided demo intentionally does
  not require authentication.
- This configuration is not suitable for commercial data or real payments.

Rollback is application-only: redeploy commit `b41ba82`. Do not alter DNS or
Google Workspace MX and TXT records.

## Real Provider Promotion

Promote providers only after the live fixture journey is stable:

1. Add OpenAI and select the `openai` research provider.
2. Add verified Resend and controlled demo recipient settings.
3. Add Twilio and a controlled demo recipient.
4. Add Pinch sandbox credentials, HTTPS return URL and webhook secret.
5. Enable production runtime, buyer capability protection and durable storage.
6. Run `npm run smoke:staging -- --origin https://YOUR-STAGING-ORIGIN`.
7. Prove physical email, SMS, hosted checkout and authoritative webhook
   confirmation before making those claims publicly.

Use a separate staging origin for this promotion. Do not test new external
provider credentials directly against the public fixture demo.
