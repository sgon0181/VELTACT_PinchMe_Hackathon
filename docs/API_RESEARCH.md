# Veltact 2.0 API Research

## Selected Integrations

### OpenAI Responses API

Use the Responses API with the `web_search` tool for:

1. cited industrial solution research; and
2. supplier discovery from the approved Need Profile.

The API returns source annotations and can restrict search to selected domains.
Veltact stores source title, URL, publication date when available, access time,
and a short evidence note. Generated analysis is labelled as AI-assisted and is
not presented as engineering diagnosis or control-system instruction.

Operational guardrails:

- one research call and one discovery call per buyer run;
- no more than ten discovered supplier candidates;
- schema-validated structured output;
- timeout and deterministic fixture fallback;
- no automatic outreach from search results.

Reference: <https://developers.openai.com/api/docs/guides/tools-web-search>

### Firecrawl

Firecrawl Search is an optional secondary discovery provider using
`POST /v2/search`. It is not required for the primary demo path and is disabled
without `FIRECRAWL_API_KEY`.

Reference: <https://docs.firecrawl.dev/api-reference/endpoint/search>

### Pinch

The existing authenticated Pinch payer and hosted Payment Link integration
remains the payment provider. V2 adds project and milestone identifiers to
payment metadata and records webhook or reconciliation evidence. Browser return
redirects are never treated as authoritative payment confirmation.

### Outreach Providers

The existing Resend/SendGrid email and Twilio SMS/WhatsApp adapters remain
controlled delivery channels. V2 only sends to buyer-approved leads and applies
the configured demo destination override where present.

## Compliance Constraints

- Australia-only initial scope.
- Public contact information is discovery evidence, not implied marketing consent.
- No address harvesting, mass unsolicited outreach, or automatic supplier
  enrolment.
- Every outreach message identifies Veltact, states why the supplier was
  contacted, provides contact details, and includes an opt-out path.
- Supplier profile activation requires supplier claim and approval followed by
  buyer approval.
- Robots directives and source terms must be respected by any future crawler.
- Google Places data is not used as a durable supplier database because of
  attribution and storage restrictions.

References:

- <https://www.acma.gov.au/avoid-sending-spam>
- <https://www.oaic.gov.au/privacy/your-privacy-rights/social-media-and-online-privacy>
- <https://www.rfc-editor.org/rfc/rfc9309>
