# Veltact Demo Runbook

## Purpose

This is the operator procedure for the canonical Find, Connect and Deploy demo.
`docs/PRODUCT.md`, `docs/DEMO_BLUEPRINT.md`,
`docs/INTEGRATION_CONTRACT.md` and `docs/DEPLOYMENT.md` remain authoritative.

The readiness command is non-destructive. It makes credential-free `GET`
requests to public pages, `/api/health` and, only for a strict provider
deployment, `/api/pinch/health`. It does not reset data, create invitations,
send messages, create a checkout or print health payloads, tokens or secrets.

## Readiness Gate

Run from the exact commit intended for deployment. `EXPECTED_SHA` must be the
integrated commit deployed to the target, not an agent branch SHA.

Prewarm a free-tier service without displaying its health payload:

```bash
ORIGIN=https://veltact.com
EXPECTED_SHA=$(git rev-parse HEAD)
curl --fail --silent --show-error \
  --retry 18 --retry-all-errors --retry-delay 5 --retry-max-time 180 \
  --max-time 20 "$ORIGIN/api/health" >/dev/null
```

Certify the public deterministic fixture deployment:

```bash
npm run smoke:staging -- \
  --origin "$ORIGIN" \
  --expected-sha "$EXPECTED_SHA" \
  --require fixture
```

Certify a separate real-provider staging deployment:

```bash
npm run smoke:staging -- \
  --origin "$ORIGIN" \
  --expected-sha "$EXPECTED_SHA" \
  --require strict
```

Use `--require either` only for diagnosis. A release rehearsal must name the
expected profile so a provider-mode change cannot silently change demo
behavior.

The command exits:

- `0`: all checks pass and the requested profile matches.
- `1`: stale revision, malformed health, origin mismatch, failed page/API
  check, unavailable capability or profile mismatch.
- `2`: invalid command usage.

`READY fixture-demo-ready` means deterministic fixture research, local-demo
email and SMS, and non-authoritative local-demo payment are available.
`READY strict-real-provider-ready` means OpenAI, external email, Twilio SMS and
Pinch modes report ready, and Pinch sandbox authentication passed. Neither
classification proves the browser journey, physical delivery, checkout or
authoritative payment confirmation; those are witnessed below.

Stop on every nonzero exit. Never rehearse against a revision that does not
match `EXPECTED_SHA`.

## Fresh Start

1. Record the origin, expected SHA, readiness classification and gate time in
   the demo notes. Do not record a health response body.
2. Close old buyer and supplier tabs. Open Browser A in a fresh profile or
   private context with no prior Veltact local storage.
3. Open only `ORIGIN`, choose `Trial Demo`, and confirm the buyer workspace is
   `/index.html` with no old workspace loaded.
4. On a fixture deployment, select `Demo: Robotic integration`. On strict
   staging, enter the locked mixed-carton robotic palletising scenario in
   Western Sydney; production mode intentionally hides development controls.
5. Keep all URLs containing `accessToken` or supplier `token` values out of
   screen recordings, chat, issue trackers and shared terminal logs.

The readiness gate does not clear shared state. A new browser context and a new
requirement provide the normal clean start without mutating another rehearsal.

## Two-Browser Rehearsal

Use Browser A for the buyer and a separate Browser B private context for
suppliers. Browser B must not share buyer storage or an authenticated buyer
session.

1. In Browser A, analyse the robotic requirement. Confirm one reviewed Need
   Profile, exactly three cited pathways, missing information, safe preparation
   and escalation triggers.
2. Select one pathway. Download the report, verify the selected scope appears,
   then choose `Find suppliers`.
3. Confirm three candidates show explainable fit and provenance. Select the
   intended candidates, choose `Connect`, select Link, Email and SMS, then
   choose `Send` once.
4. In fixture mode, use the development-only private links and keep delivery
   labelled local demo or not sent. In strict mode, open only links delivered
   to the controlled email inbox and phone.
5. Open the first private link in Browser B. Confirm the requirement, match
   reason and source disclosure. Submit `Can help`, availability, a positive
   indicative price, relevant experience, approach, assumptions and
   conditions; download the quote summary.
6. Close that supplier tab. Open a second supplier link in a new Browser B
   private tab and submit a contrasting valid response. Never reuse one
   supplier token for another supplier.
7. In Browser A, confirm both responses arrive without a reset. Refresh once
   and verify the same workspace and responses return.
8. Compare availability, price, technical fit, experience, approach,
   assumptions and conditions. Select one submitted `Can help` response.
9. Confirm exactly one engagement and one commitment milestone are shown.

For the 60-second presentation, one manually submitted response may be paired
with the clearly labelled deterministic fixture response described by the demo
blueprint. The full readiness rehearsal still submits two supplier responses.

## Payment Truth

### Fixture Profile

Open the local-demo commitment return and use `Record local demo payment`.
Confirm the interface says that no Pinch transaction or external payment was
created. The backend may then secure the supplier for demonstration using
explicitly non-authoritative local-demo evidence.

Allowed claim:

> This deterministic demo records local commitment evidence; it does not create
> a Pinch transaction or move money.

### Strict Profile

Open the Pinch-hosted sandbox checkout. On browser return, first confirm the
supplier is not secured merely because the browser returned. Complete the
sandbox payment and wait for verified webhook or reconciliation evidence.
Only then refresh payment status and show `Commitment paid` or
`Supplier secured`.

Allowed claim after witnessed backend confirmation:

> Pinch accepted the sandbox commitment and Veltact secured the supplier only
> after authoritative backend payment evidence.

For both profiles, Deploy begins at
`Site Assessment / Scoping Visit` with `0% engineering progress`.

Never say:

- `Supplier paid`.
- `Funds are in escrow`.
- Payment proves engineering work started or completed.
- A browser return confirms payment.

## Exact Claims

Use only the claim supported by the current run:

- Fixture research: `These are deterministic fixture pathways for a repeatable
  demonstration.`
- Live research, only after the external provider completes in this run:
  `The research provider completed this result in this run.`
- Fixture outreach: `Veltact prepared private supplier links; no external email
  or SMS delivery is claimed.`
- Provider-accepted outreach: `The provider accepted this selected delivery.`
- Physically witnessed outreach: `The controlled inbox or phone received the
  private link in this rehearsal.`
- Candidate provenance: `Public evidence produced a candidate, not a verified
  or enrolled supplier.`
- Supplier response: `The supplier returned comparable commercial intent.`
- Fixture commitment: `Non-authoritative local-demo evidence secured the
  supplier for this demonstration.`
- Strict commitment, only after backend evidence:
  `Authoritative Pinch sandbox evidence secured the supplier.`

Readiness alone supports only:

> The deployment is configured and reachable for this readiness profile;
> end-to-end provider outcomes still require this witnessed rehearsal.

## Recovery

1. Cold start or timeout: rerun the prewarm command, then rerun the complete
   readiness gate. Do not increase claims because a page eventually loaded.
2. Stale SHA: wait for deployment to finish and rerun with the intended SHA.
   Do not continue on a different revision.
3. Buyer refresh issue: return to the same buyer URL, refresh once and verify
   the Need Profile ID. Start a new requirement if the workspace cannot be
   recovered.
4. Expired or invalid supplier link: create a fresh invitation from the active
   buyer workspace. Do not edit, log or guess a token.
5. Missing realtime update: refresh Browser A and verify the response through
   the API-backed workspace before continuing.
6. Strict provider failure: stop strict claims. Repair and redeploy, or move to
   the separately configured fixture origin and rerun with `--require fixture`.
7. Payment return without confirmation: leave the engagement pending, use
   `Check payment status`, and inspect provider/deployment logs. Never record
   authoritative success manually.

As a last-resort fixture recovery, the development-only reset creates a seeded
workspace but mutates shared demo state:

```bash
VELTACT_BASE_URL="$ORIGIN" npm run demo:reset -- --robotics
```

Run it only from a private operator terminal after other rehearsals stop. Its
output contains scoped buyer and supplier URLs; do not record, publish or paste
that output. The reset is unavailable on strict production staging.

## Rollback

The authorized application-only rollback in `docs/DEPLOYMENT.md` is commit
`93ba999`. It includes the current health contract and passed the fixture
release gate before the stale-workspace recovery hotfix. Do not alter DNS or
Google Workspace MX/TXT records.

After every rollback, prewarm and run the gate against the exact rollback SHA;
make no readiness claim until it passes.
