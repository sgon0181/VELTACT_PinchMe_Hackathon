# Veltact 2.0 Human Actions

The complete workflow runs with labelled deterministic fallbacks. External
provider claims require the corresponding credentials and a successful call in
the current environment.

## Before a Public Demo

1. Copy `apps/api/.env.example` to `apps/api/.env`.
2. Add valid Pinch sandbox credentials and webhook secret.
3. Set `PUBLIC_BASE_URL`, `WEB_ORIGIN` and `API_PUBLIC_URL` to the HTTPS tunnel
   or deployed application origin.
4. Add `OPENAI_API_KEY` to enable cited live research and discovery.
5. Optionally add `FIRECRAWL_API_KEY` for discovery fallback.
6. Configure Resend/SendGrid and/or Twilio credentials.
7. Set outreach destination overrides to inboxes and numbers whose owners have
   agreed to receive the demonstration messages.
8. Register `${PUBLIC_BASE_URL}/api/pinch/webhooks` in Pinch.
9. Confirm readiness with `curl -s ${PUBLIC_BASE_URL}/api/health`.
10. Run `npm run demo:reset` and use the exact URLs printed by the command.

Never use a discovered public address as an automatic demonstration destination.

## Repeatable Local Demo

Start the single-process application:

```bash
npm run dev
```

Seed the urgent PLC scenario:

```bash
npm run demo:reset
```

Seed the planned robotics scenario:

```bash
npm run demo:reset -- --robotics
```

The reset output contains the buyer capability URL and one supplier claim URL.
Open both exactly as printed. The deterministic path uses:

- `VELTACT_RESEARCH_PROVIDER=fixture`
- `EMAIL_PROVIDER=local_demo`
- `SMS_PROVIDER=none`

The development-only milestone action records local evidence so the UI can be
tested without external payment. It is not a Pinch transaction.

## External Provider Status

- OpenAI: ready behind `OPENAI_API_KEY`; otherwise fixtures.
- Firecrawl: optional and disabled without `FIRECRAWL_API_KEY`.
- Email: Resend or SendGrid delivers only when configured; `local_demo` does not.
- SMS/WhatsApp: Twilio delivers only when configured and accepted by Twilio.
- Pinch: hosted checkout and authoritative evidence require valid sandbox
  credentials plus webhook or reconciliation access.

## Tunnel Checks

After starting an HTTPS tunnel, verify:

1. Buyer and supplier claim pages load over the public origin.
2. Invitation links contain the public origin.
3. The Pinch return URL resolves to the buyer application.
4. `POST /api/pinch/webhooks` is reachable from Pinch.
5. No capability token or provider secret appears in screenshots or logs.

## Truthful Demo Labels

- `Live` means an external API completed successfully in the current run.
- `Fixture` means deterministic local evidence was used.
- `Discovered` does not mean verified, approved or onboarded.
- `Payment link created` does not mean paid.
- `Supplier secured` requires authoritative payment evidence.
- Pinch milestone payments are billing events, not escrow.
