# Archived: Veltact Canonical Journey UI/UX Assessment

Assessment date: 26 July 2026

## Scope

This assessment covers the current canonical product entry, RapidMatch buyer
workspace, private supplier response page and Pinch-backed Deploy transition.
The separate V2 buyer interface is donor code and is not part of the public
product journey.

The release walkthrough covered:

- Public landing and both deterministic scenario launchers.
- Empty buyer intake at desktop and 390 px.
- PLC and robotics supplier matching and outreach.
- Two private supplier responses per scenario.
- Buyer comparison, selection and scenario-correct commitment amount.
- A real Pinch TEST MODE hosted checkout and backend-authoritative secured state.
- Deployment progress remaining at 0% after Site assessment funding.
- Browser console errors and horizontal overflow.

## Current Product Journey

`factory evidence -> Need Profile -> cited plan -> specialist decision ->
two supplier matches -> approved outreach -> two responses -> comparison ->
selection -> Pinch commitment -> verified supplier secured -> deployment`

The buyer remains in one workspace. Suppliers use separate scoped links because
they must not receive buyer controls or competing supplier information.

## What Works

- The landing page presents Find, Connect and Deploy as one product.
- `Demo: PLC` and `Demo: Robotic integration` are the only scenario labels.
- Both resets return one buyer URL and exactly two supplier response URLs.
- PLC urgency renders as one day; robotics renders as 60 days.
- Matching explains capability, location, priority and risks.
- Local demo email is labelled `Local demo only`, not `Sent`.
- Missing SMS setup is labelled `Not configured`, not `Failed`.
- Both supplier presets submit contract-valid, contrasting responses.
- The buyer receives supplier responses live and can compare them side by side.
- Selection does not imply payment or supplier security.
- Pinch creates a real TEST MODE payer and hosted Payment Link for the selected
  response amount.
- Browser return does not confirm payment. Verified backend evidence does.
- Funding the Site assessment secures the supplier while engineering remains
  at 0%.
- The landing and buyer intake have no horizontal overflow at 390 px.
- The tested landing, buyer, supplier and Pinch pages had no console errors.

## Remaining Clarity Work

### P1 - Shorten Repeated Buyer Framing

The full buyer headline remains visible in later Connect and Deploy states. It
uses valuable vertical space after the requirement has already been created.
Collapse it to a compact workspace header after intake.

### P1 - Make The Supplier Demo Utility Faster

The fixture response utility is correctly secondary, but a video operator must
expand it, load a preset, enter a contact name and accept the source disclosure.
Keep those consent steps, but place the development utility near the form
heading and make its completed state obvious.

### P1 - Tighten Landing Vocabulary

Some landing copy still describes supplier profile claiming and correction.
The canonical supplier page now confirms company/contact details and submits
one response without creating an account. Align the landing copy with that
simpler behavior.

### P1 - Keep One Next Action In View

Long research and comparison content can move the next action below the fold.
A restrained sticky action footer would help the video operator without adding
new workflow controls.

## Recommended 60-Second Route

1. Open `/index.html` and choose `Demo: Robotic integration`.
2. Structure and review the requirement, cited plan and specialist path.
3. Approve the two matched suppliers.
4. Open each secure supplier link in a separate tab, load a contrasting fixture
   response and submit it.
5. Return to the buyer workspace, compare and select.
6. Create the Pinch commitment and open TEST MODE checkout.
7. Complete checkout with published Pinch sandbox card data.
8. Return to Veltact and show `Supplier secured`, `Site assessment funded` and
   `0% engineering progress`.

The landing guided launcher is useful for resetting deterministic state and
obtaining paired role URLs. The product story itself should be recorded from
the canonical buyer workspace.
