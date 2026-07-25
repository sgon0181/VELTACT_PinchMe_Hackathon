# Veltact Product Journey UI/UX Assessment

Assessment date: 26 July 2026

## Scope

The assessment covered:

- Public landing and guided demo launcher.
- Empty V2 buyer intake on desktop and 390 px mobile.
- V2 robotics journey through Find, Connect, private supplier claim, buyer
  activation, supplier response, selection, local payment evidence and
  milestone acceptance.
- Classic RapidMatch buyer intake, matching, outreach and supplier response.
- Browser console output and horizontal overflow.

No live outreach or Pinch transaction was triggered. Payment inspection used
the explicitly labelled local demo evidence path.

## Executive Assessment

The product journey is technically demonstrable, but the interface exposes too
much lifecycle and project machinery at once. The user can complete the
workflow, yet frequently has to infer which of several valid-looking actions is
the next one.

The strongest concept is the single requirement moving through Find, Connect
and Deploy. The largest clarity risks are:

1. V2 and classic RapidMatch both look like primary products.
2. Connect separates supplier approval into several similarly worded actions.
3. The guided V2 scenario produces only one commercial response, weakening the
   comparison promise.
4. Deploy presents payment, four milestones, eight task controls and change
   control simultaneously.
5. Internal lifecycle language is visible where users need plain commercial
   outcomes.

## What Works

- The landing page now presents Find -> Connect -> Deploy as one coherent
  operating journey.
- `Demo: PLC` and `Demo: Robotic integration` clearly identify scenario-loading
  controls on the landing page, V2 intake and classic RapidMatch.
- Buyer and supplier role boundaries are explicit.
- The private supplier invitation explains why the supplier was contacted and
  does not expose competing suppliers or buyer controls.
- The Connect handoff strip makes cross-tab progress easier to understand.
- Match evidence, fixture provenance and local payment evidence are labelled
  truthfully.
- Buyer and supplier pages had no browser console errors.
- The changed controls fit at desktop and 390 px mobile widths without
  horizontal overflow.

## Priority Findings

### P0 - Choose One Canonical Product Journey

The public site links both V2 and classic RapidMatch. Their steps, terminology
and state behavior differ, so a new user cannot know which represents Veltact.

Improve by:

- Making V2 the only primary product CTA.
- Moving classic RapidMatch under a development-only or clearly labelled
  `Legacy hackathon demo` action.
- Using one canonical vocabulary across the landing, buyer and supplier pages.

### P0 - Make The Next Action Unmistakable

Find exposes `Update decision` and `Review 3 candidates`. Connect exposes
outreach approval, invitation sending, supplier profile approval and
`Activate in RapidMatch`. These are valid lifecycle transitions but read as
repeated approval of the same supplier.

Improve by:

- Showing one primary `Continue` action for the current lifecycle state.
- Moving secondary or completed actions into a compact activity history.
- Renaming buyer activation to a commercial outcome such as
  `Allow supplier to respond`.
- Adding a sticky stage footer with current state, next action and expected
  result.

### P0 - Demonstrate A Real Comparison

The guided V2 scenario creates one supplier invitation and one response. The
buyer reaches a section called comparison but has nothing to compare.

Improve by:

- Preparing two supplier invitation paths for the guided scenario.
- Returning two standardised responses with meaningfully different price,
  availability, fit and assumptions.
- Presenting the responses in a compact comparison table before selection.
- Showing why one response best matches the buyer's stated priority.

### P0 - Preserve State Reliably

V2 restores the scoped buyer workspace. Classic RapidMatch returned to an empty
intake after a browser reload during the walkthrough.

Improve by:

- Persisting classic workflow identity in the URL or local storage if the route
  remains public.
- Preferably removing classic RapidMatch from the canonical demo path and
  concentrating reliability work on V2.

### P1 - Turn Intake Into Two Clear Steps

V2 shows raw requirement intake, AI action, structured fields and buyer details
at the same time. Default urgency and budget values can look like user data.

Improve by:

1. Start with one dominant requirement field and optional evidence.
2. Use `Structure requirement` as the single primary action.
3. Reveal a reviewed Need Profile afterward.
4. Keep company and contact information in a secondary drawer or final review
   section.
5. Leave urgency and budget empty until supplied or generated.

Demo scenarios should remain small utility actions under a clear
`Try with demo data` label.

### P1 - Reduce Research Density

Find shows three long approach cards with checked controls, unlabeled numeric
scores, preparation lists, escalation lists and capability tags.

Improve by:

- Leading with one recommended approach and a short reason.
- Labelling scores as confidence or fit, or removing them.
- Collapsing supporting evidence and technical detail by default.
- Explaining what selecting an approach changes downstream.
- Replacing `Update decision` with a single outcome-oriented action such as
  `Find suppliers for this plan`.

### P1 - Simplify Supplier Onboarding

The supplier claim is trustworthy but long. The supplier reviews many profile
fields before reaching the commercial response, then waits for buyer approval
and activation.

Improve by:

- Asking the supplier to confirm company identity, contact and core capability
  first.
- Moving extended profile fields into an optional edit section.
- Showing a persistent `Step 2 of 4` progress summary.
- Combining buyer profile approval and activation when policy allows.
- Replacing `RapidMatch activation` with user-facing participation language.

### P1 - Make Outreach Failure Legible

The guided Connect screen shows email as sent and SMS as failed because SMS is
not configured. This is truthful but visually resembles a production failure.

Improve by distinguishing:

- `Sent` for provider-accepted delivery.
- `Not configured in this demo` for unavailable channels.
- `Failed` only for an attempted provider delivery that failed.

### P1 - Focus Deploy On The Current Milestone

Deploy immediately exposes all milestones, every task status and change
control. Pinch payment competes visually with local demo payment.

Improve by:

- Showing a project summary and one `Current milestone` section first.
- Making real Pinch checkout the primary commercial action.
- Moving local demo payment into a development-only utility menu.
- Collapsing future milestones.
- Hiding task and change-control detail until the user enters delivery mode.
- Adding a concise funding evidence panel with amount, provider, timestamp and
  verification state.

The walkthrough also allowed milestone acceptance while its delivery tasks
still appeared incomplete. Acceptance criteria and task completion should have
an explicit relationship so the interface does not imply that payment alone
completed engineering work.

## Recommended Journey

### Public Entry

`Start a requirement` -> buyer intake

Development only:

`Demo: PLC` or `Demo: Robotic integration` -> paired buyer and supplier links

### Find

Describe need -> structure Need Profile -> review recommended approach ->
`Find suitable suppliers`

### Connect

Review candidates -> `Invite selected suppliers` -> delivery status -> two or
more responses -> comparison -> `Select supplier`

### Deploy

Confirm engagement -> fund current milestone through Pinch -> verify payment
evidence -> execute tasks -> accept milestone -> unlock next milestone

At every point the screen should expose one primary action and one sentence
describing what happens next.

## Recommended Delivery Order

1. Make V2 the only canonical public workflow.
2. Consolidate the Connect approval and activation actions.
3. Add a deterministic second supplier response to the guided demo.
4. Replace the response list with a decision-focused comparison table.
5. Convert Deploy into a current-milestone view with progressive disclosure.
6. Split V2 intake into describe and review states.
7. Standardise lifecycle terminology, empty states and provider-status labels.

This order improves demo comprehension without expanding the locked
Find -> Connect -> Deploy product scope.
