# Veltact Demo Blueprint

## Product Reference

`docs/PRODUCT.md` is authoritative. This blueprint defines the strongest
repeatable demonstration of that product.

Veltact is one RapidMatch-based buyer journey:

**Find a solution -> Connect with responding suppliers -> Deploy through a
Pinch-backed commitment**

RapidMatch is the Connect engine. V2 is not presented as a separate product.

## Demo Thesis

Veltact turns an industrial problem into an evidence-backed action plan. When
the factory cannot execute the plan internally, RapidMatch makes relevant
suppliers respond, Pinch secures the selected provider and Veltact keeps the
delivery visible.

## Primary Scenario

A factory plans a mixed-carton robotic palletising cell in Western Sydney.
The buyer provides a written requirement with optional report and photo
evidence. Veltact structures the need, researches cited solution pathways and
shows when specialist integration is required.

The buyer chooses `Find a specialist`. RapidMatch identifies relevant robotics
integrators, sends approved invitations, receives two contrasting responses and
supports a clear selection. The buyer funds a site-assessment commitment through
Pinch and sees the supplier become secured.

The urgent Siemens PLC recovery scenario remains a second deterministic dataset
using the same product journey.

## Demo Controls

Development-only scenario controls are:

- `Demo: PLC`
- `Demo: Robotic integration`

Both controls must populate the same canonical RapidMatch buyer workspace.
They must not launch different products.

## Canonical Screens

### 1. Find - Describe The Need

Visible controls:

- One dominant requirement field.
- Optional PDF evidence.
- Optional photograph evidence.
- Location.
- Urgency.
- Budget.
- Buyer priority.
- One primary `Analyse requirement` action.

Company and contact information remain secondary. Demo controls are utilities,
not the primary action.

### 2. Find - Review The Plan

Show:

- Structured Need Profile.
- One recommended solution pathway.
- Up to two alternative pathways.
- Cited evidence.
- Missing information.
- Safe factory preparation.
- Specialist escalation triggers.

Primary outcomes:

- `Use this plan internally`
- `Find a specialist`

Research must not claim a conclusive machinery diagnosis.

### 3. Connect - RapidMatch

Show:

- Three explainable supplier candidates.
- Public-evidence provenance and risk labels.
- One buyer approval action.
- Email and SMS delivery state.
- Private supplier invitation links in development only.

The buyer should not see separate profile approval and marketplace activation
buttons. Any backend consent stages must resolve behind one clear next action.

### 4. Supplier Opportunity

The supplier opens one token-scoped link and sees:

- The requirement.
- Why it matched.
- Source disclosure.
- Minimal company/contact confirmation.
- Can help / cannot help.
- Availability.
- Indicative price.
- Relevant experience.
- Proposed approach.
- Assumptions and conditions.

The supplier confirms profile information and submits the quote from one concise
screen. No general Veltact account is created.

### 5. Connect - Compare And Select

At least two responses are shown in a compact comparison:

- Availability.
- Indicative price.
- Technical fit.
- Relevant experience.
- Proposed approach.
- Assumptions.
- Conditions.

The demo responses must have meaningful trade-offs, such as fastest response
versus lower price. Fixture responses remain labelled.

Primary action:

`Select supplier`

### 6. Deploy - Commit And Track

Show:

- Selected supplier.
- Commitment milestone and amount.
- Real Pinch hosted checkout.
- Payment evidence status.
- `Supplier secured` only after authoritative backend evidence.
- Simple milestone progress.

Do not show the full V2 project-management surface in the core demo.

## Locked 60-Second Story

### 0-8 seconds - Industrial problem

Select `Demo: Robotic integration` and show the requirement plus PDF/photo
evidence.

Narration:

> Industrial teams often know the outcome they need but not the safest,
> best-supported path to deliver it.

### 8-20 seconds - Find

Run `Analyse requirement`. Show the Need Profile and cited solution pathways.

Narration:

> Veltact structures the evidence and returns current, cited solution pathways,
> including what the factory can prepare and when specialist help is required.

Choose `Find a specialist`.

### 20-36 seconds - Connect

Show three explainable matches and send approved invitations.
Show email and SMS states.

Narration:

> RapidMatch turns the chosen scope into one standard request and contacts the
> most relevant suppliers in parallel.

### 36-46 seconds - Supplier response

Submit one response through the private supplier link. A second labelled demo
response is already available.

Narration:

> Suppliers return comparable commercial intent, not search results.

### 46-53 seconds - Compare

Compare availability, price, fit and approach. Select the preferred supplier.

### 53-59 seconds - Deploy

Open the real Pinch hosted checkout for the site-assessment commitment.
Return to backend-verified payment evidence.

Narration:

> Pinch turns the selected response into a commercial commitment.

### 59-60 seconds - Outcome

Show:

`Supplier secured`, `Site assessment funded` and `0% engineering progress`

Final line:

> Find the path. Connect with the right supplier. Deploy with control.

## Truth And Safety Rules

- `Live` means an external provider completed successfully in this run.
- `Fixture` means deterministic demo evidence.
- `Sent` means the provider accepted the delivery.
- `Not configured` is not displayed as a failed delivery attempt.
- Public discovery does not mean verified supplier.
- Supplier consent is required before marketplace activation.
- Browser return does not confirm payment.
- Pinch billing is not escrow.
- Payment does not mark engineering work complete.
- Veltact provides decision support, not unsafe diagnostic instructions.

## P0 - Canonical Journey

- One RapidMatch-based buyer workspace.
- Text, PDF and photo intake.
- Need Profile.
- Cited solution pathways.
- Internal-plan or specialist decision.
- Explainable supplier matching.
- Buyer-approved outreach.
- Private supplier response.
- Two comparable responses.
- Selection.
- Real Pinch authentication, payer and hosted Payment Link.
- Backend-verified secured state.
- Repeatable PLC and robotics scenarios.
- No exposed credentials.

## P1 - Demo Clarity

- One primary action per state.
- Live supplier response update.
- Honest email/SMS status.
- Clear RapidMatch transition inside Connect.
- Decision-focused comparison.
- Strong selected-to-secured transition.
- Lightweight milestone progress.
- Browser refresh does not lose the active buyer workspace.
- Desktop and mobile layouts have no overlap or horizontal overflow.

## P2 - Only After P0 And P1

- Additional evidence formats.
- More live supplier-discovery providers.
- Production account system.
- Additional deployment collaboration.
- Automated voice escalation.

## Explicitly Excluded

- A separate V2 product.
- A second buyer workspace.
- Complex project management.
- General chat or messaging.
- Autonomous supplier enrolment.
- Scraping without provenance.
- Full KYC.
- Unsupported commission, verification or escrow claims.

## Build Rule

Every implementation decision must answer:

> Does this make the single journey from problem evidence to secured and visible
> delivery clearer, more reliable or more truthful?

If not, it is outside the canonical demo.
