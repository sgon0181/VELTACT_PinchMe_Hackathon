# Veltact Product

## Authority

This file is the sole source of truth for Veltact's product boundary and
canonical buyer journey. `docs/DEMO_BLUEPRINT.md` selects a demonstrable slice
of this product. Architecture and integration documents describe how it is
implemented; they do not redefine the product.

## Product Promise

Veltact turns an industrial problem into an evidence-backed action plan, then
finds, secures and coordinates the right supplier when the factory needs
external expertise.

The product is one workflow:

**Problem evidence -> Need Profile -> selected solution -> RapidMatch supplier
response -> Pinch commitment -> delivery progress**

RapidMatch is not a separate product. It is Veltact's supplier-response engine
inside Connect.

## Canonical Buyer Journey

### Find

The buyer provides the industrial problem once using:

- Written factory context.
- An optional PDF report.
- Optional photographs.
- Location, urgency, budget and buyer priority.

`Trial Demo` opens a fresh intake. Its first viewport is deliberately simple:
the dominant requirement field, PDF and photograph inputs, and one analysis
action. Procurement details may use progressive disclosure and remain editable
in the reviewed Need Profile.

Veltact structures the evidence into a buyer-reviewed Need Profile and returns:

- Three cited solution pathways based on current industry evidence.
- Relevant best-practice considerations.
- Missing information.
- Safe preparation the factory can complete internally.
- Clear triggers for specialist escalation.

Veltact does not diagnose machinery or provide unsafe control instructions.
Research is decision support, not engineering sign-off.

The buyer selects one pathway and can:

- `Download report`
- `Find suppliers`

Downloading is a utility, not a lifecycle transition. `Find suppliers` passes
the same Need Profile and the single selected solution scope into RapidMatch.

### Connect

RapidMatch converts the approved scope into a standardised request for quote:

1. Explainable supplier matches are produced from catalog and public discovery
   evidence.
2. The buyer selects candidates and chooses `Connect`.
3. Veltact reveals independent `Link`, `SMS` and `Email` channel controls.
   Email and SMS may be selected together. Link creates one private opportunity
   URL per selected supplier without claiming external delivery.
4. The buyer chooses `Send` once to create the invitations and attempt only the
   selected external channels.
5. Each supplier confirms its identity and submits availability, indicative
   price, relevant experience, proposed approach, assumptions and conditions.
6. The buyer compares at least two standardised responses.
7. The buyer selects one supplier.

Public supplier evidence creates a candidate, not a verified or enrolled
marketplace supplier. Outreach requires buyer approval. Supplier activation
requires supplier consent.

### Deploy

Supplier selection creates one engagement and a commitment milestone:

1. The buyer opens a real Pinch hosted checkout for the commitment milestone.
2. A browser return never marks payment successful.
3. Verified webhook or reconciliation evidence marks the supplier secured.
4. Veltact shows lightweight delivery progress.

The commitment reserves supplier attention for diagnosis, an emergency callout
or a site assessment. It is not presented as supplier settlement. The demo-level
deployment view contains:

- Overall completion percentage.
- Current milestone.
- Next milestone.
- Supplier name.
- Latest update.
- Payment evidence state.

PLC recovery uses:

`Diagnosis -> Recovery -> Validation -> Handover`

Robotic integration uses:

`Site Assessment / Scoping Visit -> Design -> Installation -> Commissioning`

Veltact does not present Pinch billing as escrow. Payment does not itself prove
that engineering work is complete.

## Canonical Product Surface

- One public Veltact entry.
- One sticky public header with `Sign in`, `Create account` and `Trial Demo`.
- An informative landing body without duplicated account or demo actions.
- One RapidMatch-based buyer workspace moving through Find, Connect and Deploy.
- One private, token-scoped supplier opportunity page.
- One engagement and deployment record for the selected response.

Minimal account entry is isolated from the trial journey. It may collect an
email/password account record and create a session, but it does not gate
`Trial Demo`, replace requirement-scoped buyer capability checks or imply
durable production identity storage.

The existing RapidMatch buyer experience is the implementation base. V2 is
temporary donor code for research, discovery provenance, milestone templates
and payment evidence. The V2 buyer application is not a second product and must
not remain a competing public journey.

## Interaction Principles

- Show one primary next action for the current state.
- Do not repeat the same route action throughout an informational landing page.
- Keep the original RapidMatch level of interaction density.
- Use progressive disclosure for citations, supplier evidence and project
  detail.
- Do not expose internal lifecycle transitions as repeated buyer decisions.
- Keep buyer and supplier controls on separate permission surfaces.
- Preserve truthful labels for fixture, local-demo and live-provider evidence.
- Keep the PLC and robotic integration scenarios repeatable.
- Do not ship visible controls that have no working destination.

## Commercial Model

Veltact may earn a disclosed service fee when an engagement is secured.
The interface must not claim that a commission was collected until the payment
integration actually records that fee. The initial commitment may represent a
diagnosis, site assessment, emergency callout or reserved engineering time.

## MVP Acceptance

The unified product is demonstrable when one buyer URL supports:

1. Text, PDF or photo evidence intake.
2. Buyer-reviewed Need Profile.
3. Three cited, selectable solution pathways.
4. Downloadable report or specialist decision.
5. Explainable, selectable supplier matches.
6. Buyer-controlled multi-channel email/SMS outreach and copy-link generation
   behind one `Connect` then `Send` interaction.
7. Downloadable RFQ and standardised supplier response.
8. Two standardised supplier responses.
9. Comparison and selection.
10. Real Pinch payer and hosted Payment Link.
11. Backend-verified supplier-secured state.
12. Commitment-confirmed supplier notification.
13. Lightweight deployment progress beginning with site assessment.

## Excluded Scope

- Account administration beyond minimal sign-in and account creation.
- General messaging.
- Supplier analytics.
- Automated voice escalation.
- Full supplier KYC.
- Autonomous enrolment from scraped data.
- Complex project management.
- Arbitrary task, issue, document and change-control dashboards.
- Payment or escrow claims unsupported by Pinch.
