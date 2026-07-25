# Veltact 2.0 Human Actions

The application has deterministic local fallbacks, but these actions are required
to demonstrate external services truthfully.

## Before a Public Demo

1. Copy `apps/api/.env.example` to `apps/api/.env`.
2. Add valid Pinch sandbox credentials and webhook secret.
3. Set `PUBLIC_BASE_URL` to the HTTPS tunnel or deployed application origin.
4. Add `OPENAI_API_KEY` to enable cited live research and supplier discovery.
5. Configure either Resend/SendGrid and/or Twilio credentials.
6. Set outreach destination overrides to addresses and numbers whose owners have
   agreed to receive the demo messages.
7. Register `${PUBLIC_BASE_URL}/api/pinch/webhook` in Pinch.
8. Run `npm run demo:reset` and use the exact URLs printed by the command.

## Truthful Demo Labels

- `Live` means an external API completed successfully in the current run.
- `Fixture` means deterministic local evidence was used.
- `Discovered` does not mean verified, approved, or onboarded.
- `Payment link created` does not mean paid.
- `Supplier secured` is shown only after authoritative payment evidence.
- Pinch milestone payments are billing events, not escrow.
