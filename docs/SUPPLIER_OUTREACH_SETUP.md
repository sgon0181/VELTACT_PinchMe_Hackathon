# Supplier Outreach Setup

Veltact sends each matched supplier a unique, no-login opportunity link when the buyer selects **Send to matched suppliers**. Email and mobile delivery states remain separate from invitation `viewed`, `responded`, and `declined` states. Secure links remain available when a provider is unavailable or rejects delivery.

## Phone-Ready Links

`WEB_ORIGIN` is embedded in newly created invitation links. `http://localhost:4000` works only on the same computer. For a phone demo, expose the Veltact API over HTTPS and set `WEB_ORIGIN` to that public origin:

```dotenv
WEB_ORIGIN=https://your-public-demo-origin.example
```

The API serves `supplier.html` and its `/api` routes from the same origin. Restart the API after changing environment values and create a new Need Profile so its invitations use the current origin.

## Email

Development without external delivery:

```dotenv
EMAIL_PROVIDER=local_demo
```

`local_demo` prepares the secure invitation in development or test but keeps
delivery at `not_sent` with a visible `Local demo only` explanation. It does
not call an external email provider and is unavailable in production.

Resend:

```dotenv
EMAIL_PROVIDER=resend
EMAIL_FROM=Veltact <opportunities@your-verified-domain.example>
RESEND_API_KEY=replace-with-provider-secret
SUPPLIER_OUTREACH_EMAIL_TO=demo-supplier@example.com
```

SendGrid:

```dotenv
EMAIL_PROVIDER=sendgrid
EMAIL_FROM=opportunities@your-verified-domain.example
SENDGRID_API_KEY=replace-with-provider-secret
SUPPLIER_OUTREACH_EMAIL_TO=demo-supplier@example.com
```

The sender must be accepted by the configured provider. When testing Resend with `onboarding@resend.dev`, delivery is restricted to the email address associated with that Resend account. The demo override is required while seeded supplier email addresses use placeholder domains.

## SMS

Twilio:

```dotenv
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=replace-with-provider-secret
TWILIO_FROM_NUMBER=+10000000000
SUPPLIER_OUTREACH_SMS_TO=+61400000000
```

Use E.164 phone numbers. Twilio trial projects may restrict delivery to verified recipients. The demo override is required while seeded supplier numbers are placeholders.

## Twilio WhatsApp Sandbox

1. Activate the Twilio Sandbox for WhatsApp.
2. From the receiving phone, scan the Sandbox QR code or send `join <sandbox code>` to the Sandbox number.
3. Copy the Twilio Account SID and Auth Token into `apps/api/.env`.
4. Set the Sandbox sender and receiving WhatsApp number in E.164 format:

```dotenv
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=replace-with-provider-secret
TWILIO_WHATSAPP_FROM=+14155238886
SUPPLIER_OUTREACH_WHATSAPP_TO=+61400000000
```

The Sandbox only sends to users who joined that Sandbox. Veltact currently sends a free-form opportunity message, so trigger the demo within WhatsApp's 24-hour customer-service window after the recipient messages the Sandbox. A production sender or out-of-window initiation requires an approved WhatsApp template and is not implemented.

## Shared Contract Compatibility

The shared outreach contract currently permits only `channel: email | sms`. Until A0 adds a WhatsApp contract value, Twilio WhatsApp uses the existing mobile `sms` delivery slot internally. The destination carries the required `whatsapp:` prefix, and the buyer UI labels it **WhatsApp**. No shared contract or Socket.IO event name is changed.

## Truthful Statuses

- `not_sent`: no external attempt occurred. This includes `local_demo` and an
  unconfigured provider, with the reason shown separately.
- `queued`: the backend is making an external provider request.
- `sent`: the configured external provider accepted the request.
- `failed`: an attempted external provider request was rejected, timed out or
  failed on the network.

Provider secrets belong in `apps/api/.env` or the deployment secret store and must not be committed. Never embed them in browser code.

## Readiness Check

`GET /api/health` reports boolean readiness for email, SMS and WhatsApp without returning credentials or destinations. A false SMS or WhatsApp value means the required Twilio sender, account credentials or receiving demo destination is incomplete.
