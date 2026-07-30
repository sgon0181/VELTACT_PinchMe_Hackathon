# Veltact Feature Polish Run Report

Run date: 2026-07-31

Branch: `feature-polish`

Starting point: `e95a9c9` (`30-jul-night`)

Final implementation commit before this report: `aa6c7dd`

## Result

The Phase B snowball marketplace scope is implemented and green. The keyless
RapidMatch path remains the canonical product:

`need -> research -> supplier matches -> outreach -> supplier responses -> comparison -> selection -> commitment -> delivery`

The full keyless flow was executed twice with the mandated gearbox requirement
and a fresh non-fixture requirement in each pass. Every run produced three
matches, accepted two private supplier responses, selected one supplier, recorded
explicitly non-authoritative local-demo commitment evidence, funded the ordered
milestones, completed delivery, rendered the speed receipt and updated the
private supplier registry.

Live OpenAI discovery and real Pinch sandbox settlement are implemented but were
not called during the unattended verification. They require the witnessed
morning smoke checks below.

## Feature Status

| Feature | Status | Evidence |
|---|---|---|
| F1 Per-account supplier registry | Done | Versioned contracts, persisted write-through lifecycle, buyer-scoped API, read-only buyer view, deduplication and restart tests |
| F2 Live agentic supplier discovery | Done; live rehearsal pending | OpenAI web search and optional Perplexity adapters, cited candidates, URL validation, eight-candidate cap, graceful fixture fallback and mocked provider tests |
| F3 Agent activity timeline | Done; live rehearsal pending | Persisted structured events, scoped Socket.IO updates, deterministic fixture stream and buyer replay UI |
| F4 Milestone funding via Pinch | Done with unpaid cancellation | Sequential links, per-milestone evidence, disclosed fee metadata/UI, local-demo mode, Pinch mocks and official unpaid-link deletion; paid refund intentionally not implemented |
| F5 Speed receipt | Done | Buyer-scoped receipt API, ordered real timestamps, pending states, elapsed time, general-claim baseline and one-page print CSS |
| F6 Registry-aware ranking | Done | Fixed 4/8/12 point responded/secured/delivered boosts, explicit reasons, deterministic tests and capability-match gate |

## Commits

- `cca2918` `feat: add compounding supplier registry`
- `3a0de5a` `feat: add cited live supplier discovery`
- `ef507cb` `feat: stream agent activity timeline`
- `972d787` `feat: fund delivery milestones sequentially`
- `a8596aa` `feat: add engagement speed receipt`
- `4117348` `feat: rank suppliers with registry history`
- `aa6c7dd` `fix: allow keyless provider configuration`

## Decisions

1. Registry ownership uses a one-way hash of the normalized buyer email because
   the canonical workflow currently has no authenticated account ID. API access
   still requires the need-scoped buyer capability token.
2. Registry identity deduplicates by normalized domain, then normalized supplier
   name plus location. Provenance only moves forward:
   `discovered -> contacted -> responded -> secured -> delivered`.
3. Public discovery creates candidates, never enrolled suppliers. Supplier
   consent is recorded only when the private invitation is claimed and answered.
4. Discovery `auto` mode uses a configured live provider when available and
   otherwise returns clearly labelled deterministic fixtures. Tests never call
   paid external APIs.
5. Each delivery milestone currently uses the selected response's indicative
   commitment amount. This is a prototype funding schedule, not a final
   commercial breakdown.
6. The configured 5% service fee is disclosed as an allocation within the
   milestone amount. The product does not claim commission collection or fee
   settlement.
7. Paid refunds need a separate authoritative refund lifecycle. This run ships
   only provider-backed cancellation of an unpaid pending link and never reverts
   paid state without evidence.
8. Registry ranking bonuses are bounded by lifecycle tier, not multiplied by
   history count, and are applied only after direct selected-pathway capability
   overlap.
9. The receipt baseline is the literal `Industry norm: days to weeks` and is
   labelled as a general claim. No fabricated benchmark is presented.

## New Configuration

All variables are documented in `apps/api/.env.example`. Blank optional provider
keys are now parsed as unset.

| Variable | Default without a value | Purpose |
|---|---|---|
| `VELTACT_DISCOVERY_PROVIDER` | `auto` | `auto`, `openai`, `perplexity` or `fixture` supplier discovery |
| `PERPLEXITY_API_KEY` | Unset | Optional Perplexity Sonar discovery adapter |
| `VELTACT_SERVICE_FEE_BPS` | `500` | Disclosed milestone fee allocation in basis points |
| `OPENAI_API_KEY` | Unset | Existing key used by live intake, research and OpenAI discovery |

No secrets or populated `.env` files were committed.

## Integration Surface

New HTTP surfaces:

- `GET /api/registry?needProfileId=:needProfileId`
- `GET /api/engagements/:engagementId/receipt`
- `POST /api/engagements/:engagementId/milestones/:milestoneId/payment-link`
- `POST /api/engagements/:engagementId/milestones/:milestoneId/payment-link/cancel`
- `POST /api/engagements/:engagementId/milestones/:milestoneId/demo-payment`
  (development/test local-demo provider only)

Expanded existing surface:

- `POST /api/need-profiles/:needProfileId/suppliers/discover` now merges
  registry candidates with live or fixture candidates through one explainable
  ranking pipeline.
- Buyer workspaces now include persisted `agentActivityEvents` and an optional
  `speedReceipt`.

New Socket.IO event:

- `rapidmatch:agent.activity_updated`

All buyer-owned routes above use the existing scoped buyer capability model.
Supplier claim and response routes remain private-token scoped.

## Verification

### Test growth

Counts below come from actual `npm test` runs against archived commits using the
same lockfile and clean installs.

| Phase | Before | After | Change |
|---|---:|---:|---:|
| Phase A correctness (`0d70183` -> `e95a9c9`) | 245 | 247 | +2 |
| Phase B polish (`e95a9c9` -> final) | 247 | 268 | +21 |

Final breakdown:

- Root contract/readiness tests: 14
- API tests: 157
- Buyer tests: 92
- Shared contract tests: 5
- Total: 268 passing, 0 failing

The final code state passed two consecutive runs of:

```bash
git diff --check
npm run lint
npm test
npm run typecheck
npm run build
```

Both reset commands also passed against the built API:

```bash
npm run demo:reset
npm run demo:reset -- --robotics
```

### Canonical flow passes

Pass 1:

- Mandated Newcastle bottling-line gearbox requirement
- Novel Hunter Valley ore-transfer conveyor requirement
- Three candidates and two submitted supplier responses per requirement
- All ordered milestones funded with labelled local-demo evidence and completed
- Second requirement showed
  `Delivered for you before — 1 engagement completed`

Pass 2:

- Mandated Newcastle bottling-line gearbox requirement
- Novel Newcastle grain-terminal bucket-elevator requirement
- Same complete supplier, comparison, commitment and delivery path
- Registry history reused without duplicate domains
- Novel requirement showed prior delivered history for two engagements

Browser inspection covered the landing page, fresh intake, PLC and robotics demo
utilities, solution report, supplier cards, channel chooser and responsive buyer
layout. The 375 x 812 viewport had no horizontal overflow. No browser console
warnings or errors were recorded. Private supplier pages were loaded through the
actual generated response URLs, then claimed and answered through their token
routes during both canonical passes.

## Truthful Demo Claims

Use only the claim supported by the active provider mode:

- Fixture research: deterministic, labelled research for a repeatable demo.
- Live research: claim live only when the external provider completed that run
  and source URLs are visible.
- Local-demo outreach: private links were prepared; no external delivery is
  claimed.
- Provider outreach: claim sent only when the configured provider reports
  acceptance. Claim received only when the controlled phone or inbox is
  physically witnessed.
- Discovery: public evidence produced a candidate, not a verified or enrolled
  supplier.
- Local-demo payment: non-authoritative demo evidence changed the demo state; no
  Pinch transaction or money movement occurred.
- Pinch sandbox: claim supplier secured only after backend webhook or
  reconciliation evidence is visible. Browser return alone proves nothing.
- Never claim supplier payout, escrow, collected commission or completed
  engineering work from payment evidence.

## Remaining Risks

1. **High - external rehearsal:** OpenAI live discovery and Pinch sandbox
   milestone 2 must be witnessed after this branch is deployed. Automated tests
   mock those external services by design.
2. **High - release state:** `feature-polish` is local and intentionally not
   merged, pushed or deployed by this run. Production cannot contain these
   commits until the owner performs the normal review and release.
3. **Medium - provider delivery:** real email/SMS requires a verified sender,
   Twilio/Resend/SendGrid credentials, controlled destination and canonical
   public HTTPS URLs. Keyless mode prepares links without external delivery.
4. **Medium - persistence:** the marketplace uses a single-process JSON snapshot.
   An ephemeral free-tier filesystem or concurrent multi-instance deployment is
   not production durable.
5. **Medium - account model:** registry scoping should move from hashed buyer
   email to an authenticated account ID before multi-user production use.
6. **Low - refunds:** paid milestone refunds are not exposed. Only unpaid pending
   links can be cancelled.
7. **Low - milestone pricing:** repeated indicative response amounts are suitable
   for the prototype but need a buyer/supplier-approved milestone schedule before
   real project funding.

Pre-existing untracked design assets and local tool files were left untouched.
The tracked worktree is clean.

## Morning Smoke Checklist

### A. Live OpenAI discovery

1. Check out `feature-polish` and confirm the intended commit SHA.
2. Install and build:

   ```bash
   npm install
   npm run build
   ```

3. Edit the untracked `apps/api/.env` without committing it:

   ```dotenv
   OPENAI_API_KEY=<current project key>
   VELTACT_RESEARCH_PROVIDER=openai
   VELTACT_DISCOVERY_PROVIDER=openai
   PAYMENT_PROVIDER=local_demo
   ```

4. Start the app with `npm run dev` and open
   `http://localhost:4000/index.html?start=new`.
5. Type a novel industrial requirement. Do not use a demo utility. Include
   equipment, process, location, timing and budget.
6. Run analysis and select one pathway, then choose `Find suppliers`.
7. Confirm all of the following before claiming live discovery:
   - research/discovery is labelled live, not fixture;
   - the activity timeline contains genuine source reads and URLs;
   - candidate names and domains are not fixture/catalog values;
   - each candidate has at least one valid public citation;
   - cards retain capability reasons, risks and the candidate consent warning;
   - `Your suppliers` shows the candidates as discovered, not enrolled.
8. Repeat once with an unrelated industry. If live discovery fails, confirm the
   UI says it fell back to labelled fixtures and make only the fixture claim.

Optional Perplexity check:

```dotenv
PERPLEXITY_API_KEY=<current project key>
VELTACT_DISCOVERY_PROVIDER=perplexity
```

Repeat steps 5-7 and confirm citation provider labels are Perplexity.

### B. Pinch sandbox commitment and milestone 2

1. Use a publicly reachable HTTPS deployment or tunnel. Set these in the
   untracked `apps/api/.env`:

   ```dotenv
   PAYMENT_PROVIDER=pinch
   PINCH_CLIENT_ID=<sandbox client id>
   PINCH_SECRET_KEY=<sandbox secret>
   PINCH_AUTH_URL=https://auth.getpinch.com.au/connect/token
   PINCH_API_BASE_URL=https://api.getpinch.com.au/test
   PINCH_API_VERSION=2020.1
   PINCH_RETURN_URL=https://<public-origin>/api/pinch/return
   PINCH_WEBHOOK_SECRET=<sandbox webhook secret>
   PUBLIC_BASE_URL=https://<public-origin>
   WEB_ORIGIN=https://<public-origin>
   API_PUBLIC_URL=https://<public-origin>
   ```

2. Register the Pinch sandbox webhook as:
   `https://<public-origin>/api/pinch/webhooks`.
3. Restart the API and verify authentication:

   ```bash
   curl -s https://<public-origin>/api/pinch/health
   ```

   Continue only if it returns `authenticated: true` and `environment:
   sandbox`.
4. Run the buyer flow through two real supplier responses and select one.
5. Create the commitment Payment Link. Confirm the browser leaves Veltact for
   the official GetPinch hosted origin and that the link metadata identifies the
   engagement, need, supplier, response, milestone, amount and disclosed fee.
6. Complete checkout with the currently documented Pinch sandbox payment
   method. On return, confirm the UI still says return alone proves nothing.
7. Refresh payment status until webhook or reconciliation evidence shows:
   - provider `pinch`;
   - authoritative `true`;
   - source `pinch_webhook` or `pinch_reconciliation`;
   - supplier secured;
   - the supplier commitment notification follows the verified transition.
8. Move milestone 1 to in progress and completed. Choose `Fund next milestone`.
9. Confirm milestone 2 creates a different Pinch Payment Link with its own
   `milestoneId`, the disclosed service-fee metadata and no skipped milestone.
10. Complete milestone 2 in sandbox and confirm only verified backend evidence
    changes that milestone to funded. Engineering progress must remain separate
    until the buyer records a delivery update.
11. Open the speed receipt and confirm the payment source, timestamps, elapsed
    time and milestone funding entries match the witnessed run.

If any external step fails, switch back to the labelled fixture/local-demo
profile for the presentation and do not make the live-provider claim.
