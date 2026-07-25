# Supplier Outreach Setup

Veltact sends each matched supplier a unique, no-login opportunity link when the buyer selects **Send to matched suppliers**. Email and mobile delivery states remain separate from invitation `viewed`, `responded`, and `declined` states. Secure links remain available when a provider is unavailable or rejects delivery.

## Resend Email

Configure the API process in `apps/api/.env`:

```dotenv
EMAIL_PROVIDER=resend
EMAIL_FROM=Veltact <onboarding@resend.dev>
RESEND_API_KEY=replace-with-resend-secret
SUPPLIER_OUTREACH_EMAIL_TO=your-resend-account-email@example.com
```

`onboarding@resend.dev` can only send to the email address associated with the Resend account. Sending to other recipients requires a verified sending domain.

The application calls Resend from the backend. Never embed `RESEND_API_KEY` in browser code or commit it.

## Twilio WhatsApp Sandbox

1. Activate the Twilio Sandbox for WhatsApp.
2. From the receiving phone, scan the Sandbox QR code or send `join <sandbox code>` to the Sandbox number.
3. Copy the Twilio Account SID and Auth Token into `apps/api/.env`.
4. Set the Sandbox sender and receiving WhatsApp number in E.164 format:

```dotenv
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=replace-with-twilio-secret
TWILIO_WHATSAPP_FROM=+14155238886
SUPPLIER_OUTREACH_WHATSAPP_TO=+61400000000
```

The Sandbox only sends to users who joined that Sandbox. Veltact currently sends a free-form opportunity message, so trigger the demo within WhatsApp's 24-hour customer-service window after the recipient messages the Sandbox. A production sender or out-of-window initiation requires an approved WhatsApp template and is not implemented.

## Shared Contract Compatibility

The shared outreach contract currently permits only `channel: email | sms`. Until A0 adds a WhatsApp contract value, Twilio WhatsApp uses the existing mobile `sms` delivery slot internally. The destination carries the required `whatsapp:` prefix, and the buyer UI labels it **WhatsApp**. No shared contract or Socket.IO event name is changed.

## Phone-Ready Supplier Link

`WEB_ORIGIN` is embedded in newly created invitation links. For a phone demo, it must be reachable from the phone:

```dotenv
WEB_ORIGIN=https://your-public-demo-origin.example
```

Restart the API after changing environment values and create a new Need Profile so its invitations use the current origin.
