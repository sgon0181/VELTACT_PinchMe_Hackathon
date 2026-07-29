# Supplier Outreach Setup

Veltact selects outreach providers only through environment variables. There is
no request flag or buyer control that can turn a local-demo action into a live
provider call.

- `EMAIL_PROVIDER=local_demo` and `SMS_PROVIDER=local_demo` prepare messages
  without external delivery. Their delivery state remains `not_sent`.
- `EMAIL_PROVIDER=resend|sendgrid` enables live email.
- `SMS_PROVIDER=twilio` enables live SMS or WhatsApp.
- Copy link selects no delivery channel, makes no provider request and creates
  no fabricated `sent` state.

## Common Deployment Variables

Use one API-served HTTPS origin for the buyer, supplier and API surfaces:

```dotenv
NODE_ENV=production
WEB_ORIGIN=https://staging.example.com
PUBLIC_BASE_URL=https://staging.example.com
MARKETPLACE_DATA_FILE=/var/lib/veltact/marketplace.json
```

`PUBLIC_BASE_URL`, not `WEB_ORIGIN`, is embedded in newly created supplier
response, RFQ and copy-link URLs. `WEB_ORIGIN` configures the browser origin.
Set both to the same credential-free HTTPS origin for staging.

Live outreach is rejected without a canonical HTTPS `PUBLIC_BASE_URL`.
Invitation links must also use that configured origin. Restart the API and
create new invitations after changing the origin; persisted invitations retain
their original URLs.

Use a persistent `MARKETPLACE_DATA_FILE` in deployment. Sent and ambiguous
in-flight commitment-notification states are stored there and are part of the
duplicate-suppression boundary.

Local development can remain explicit and secret-free:

```dotenv
NODE_ENV=development
WEB_ORIGIN=http://localhost:4000
PUBLIC_BASE_URL=http://localhost:4000
EMAIL_PROVIDER=local_demo
SMS_PROVIDER=none
```

Local-demo providers are unavailable when `NODE_ENV=production`.

## Staging Recipient Overrides

Seeded suppliers use placeholder contact details. Route a staging rehearsal to
controlled recipients with:

```dotenv
SUPPLIER_OUTREACH_EMAIL_TO=demo-supplier@example.com
SUPPLIER_OUTREACH_SMS_TO=+61400000000
```

`SUPPLIER_OUTREACH_EMAIL_TO` applies to both opportunity email and the
commitment-confirmed email. `SUPPLIER_OUTREACH_SMS_TO` applies to SMS.

For WhatsApp, use this instead of the SMS override:

```dotenv
SUPPLIER_OUTREACH_WHATSAPP_TO=+61400000000
```

The WhatsApp override takes precedence when new mobile delivery records are
created. Restart the API and create a new Need Profile after changing an
override. Leave overrides unset only when the stored supplier contacts are
intended live recipients.

## Resend Email

```dotenv
EMAIL_PROVIDER=resend
EMAIL_FROM=Veltact <opportunities@your-verified-domain.example>
RESEND_API_KEY=replace-with-provider-secret
SUPPLIER_OUTREACH_EMAIL_TO=demo-supplier@example.com
```

The sender domain must be verified. Resend testing with
`onboarding@resend.dev` is restricted to the address associated with the
Resend account.

Veltact supplies a stable provider idempotency key for each opportunity email
and commitment-confirmed email. Resend deduplicates matching requests for its
documented 24-hour window. Persisted Veltact `sent` state suppresses later
application retries.

## SendGrid Email

```dotenv
EMAIL_PROVIDER=sendgrid
EMAIL_FROM=Veltact <opportunities@your-verified-domain.example>
SENDGRID_API_KEY=replace-with-provider-secret
SUPPLIER_OUTREACH_EMAIL_TO=demo-supplier@example.com
```

The sender identity or domain must be accepted by SendGrid. Veltact attaches
its stable request key as `custom_args` for provider-event correlation.
SendGrid Mail Send does not provide the same request-deduplication contract as
Resend, so Veltact relies on in-process request coalescing and persisted
delivery state.

## Twilio SMS

```dotenv
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=replace-with-provider-secret
TWILIO_FROM_NUMBER=+10000000000
SUPPLIER_OUTREACH_SMS_TO=+61400000000
```

Use E.164 numbers. Twilio trial projects may deliver only to verified
recipients. The SMS includes the private response URL and an opt-out
instruction.

An HTTP success means Twilio accepted the message request; it does not prove
carrier delivery. This integration does not yet consume Twilio delivery-status
webhooks. Veltact coalesces concurrent requests in one API process, but an
ambiguous timeout followed by a later retry can duplicate an SMS.

## Twilio WhatsApp Sandbox

1. Activate the Twilio Sandbox for WhatsApp.
2. From the receiving phone, scan the Sandbox QR code or send
   `join <sandbox code>` to the Sandbox number.
3. Configure:

```dotenv
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=replace-with-provider-secret
TWILIO_WHATSAPP_FROM=+14155238886
SUPPLIER_OUTREACH_WHATSAPP_TO=+61400000000
```

The receiving user must have joined the Sandbox. Veltact sends a free-form
message, so use it within WhatsApp's 24-hour customer-service window after the
recipient messages the Sandbox. Out-of-window initiation requires an approved
template and is not implemented.

The shared contract currently exposes `email | sms`. WhatsApp therefore uses
the mobile `sms` delivery slot while provider addressing carries the required
`whatsapp:` prefix.

## Commitment Notification

No additional notification provider is configured. It uses the selected email
provider and `EMAIL_FROM`.

The supplier email is created only when the engagement is `supplier_secured`,
payment is `paid`, the evidence provider is `pinch`, the evidence is marked
authoritative and `securedAt` is present. Local-demo payment evidence never
triggers it. The message confirms buyer commitment for the next agreed
scoping or assessment step; it never claims supplier payout or completed
engineering work.

Concurrent calls share one in-flight request. Persisted `sent` suppresses
duplicates after restart. A persisted `queued` notification is not
automatically replayed because a process may have stopped after provider
acceptance but before saving `sent`; replaying through SendGrid could duplicate
the email. Reconcile that state in the provider console before any manual
retry. There is no background retry worker.

## Delivery States And Errors

- `not_sent`: no external attempt occurred, including local demo, unavailable
  configuration and rejected link configuration.
- `queued`: a live request is in flight.
- `sent`: the provider returned its documented acceptance status and, where
  applicable, a valid provider message identifier in this run.
- `failed`: a configured provider request was attempted and rejected, timed
  out or failed on the network.

Provider requests time out after 10 seconds. Timeout is an attempted failure,
not proof that the provider rejected the message; confirm provider activity
before retrying. Provider error details are length-limited and redact private
invitation tokens, RFQ path tokens, authorization values and configured
credentials.

## Release Rehearsal

1. Put secrets in `apps/api/.env` or the deployment secret store, never browser
   code or Git.
2. Restart the API after environment changes.
3. Create a new Need Profile so links and recipient overrides are current.
4. Check `GET /api/health`. Confirm provider modes and readiness without
   expecting credentials or destinations in the response.
5. Send one email and one SMS or WhatsApp message to controlled physical
   recipients.
6. Confirm each private HTTPS link opens on the phone and downloads its RFQ.
7. Complete authoritative Pinch confirmation and verify exactly one
   commitment-confirmed email.
8. Treat provider acceptance as `sent`; do not describe it as inbox, carrier or
   WhatsApp delivery without separate provider evidence.
