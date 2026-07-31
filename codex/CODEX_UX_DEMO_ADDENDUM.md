# UX / HCI / Demo-Choreography Addendum

These standards apply to every screen and interaction you build or touch, in both
phases. The bar: a judge should feel the product is fast, real, and inevitable — never
watch it being explained around. Efficient, bugless, smooth, real.

## 1. HCI principles (apply mechanically)

- **System status is always visible.** Every async operation shows what is happening
  within 100ms (button enters busy state), names the work within 1s (labelled progress
  line — "Reading supplier evidence…", never a bare spinner), and streams intermediate
  results when it will exceed 3s (this is what the agent timeline is for). No dead
  waits anywhere in the buyer or supplier journey.
- **One primary action per state** (already product law). The primary action is the
  visually loudest element below the fold line; everything else is secondary or
  disclosure. If a screen has two loud buttons, the screen is wrong.
- **Recognition over recall.** Never make the buyer remember an earlier value — repeat
  the requirement title, budget, supplier name and amount wherever the decision is
  being made (comparison, selection, payment). The Pinch payment panel must restate
  supplier + milestone + amount so confirmation feels informed, not blind.
- **Progressive disclosure.** Default view = decision-sized summary; detail behind
  "View N more…" affordances (existing pattern — reuse it). Citations, match signals,
  assumptions, evidence records are all disclosure content.
- **Error prevention over error messages.** Disable-and-explain beats reject-and-toast:
  a disabled primary action always has adjacent text saying exactly what unlocks it
  ("Complete 2 required fields — contact email, site location"). Every error state
  names the recovery action and keeps user input intact.
- **Consistency is credibility.** One badge vocabulary across the whole app (fixture /
  live / local demo / verified), one type scale, one spacing rhythm, one chip style.
  Buyer and supplier surfaces are the same design language in different accents. Audit
  any screen you touch for stray one-off styles and fold them into existing classes.
- **Accessibility is part of "impressive".** Focus lands on the new view's heading
  after every transition; all interactive elements reachable and operable by keyboard;
  status changes announced via the existing `aria-live` regions; visible focus rings;
  `prefers-reduced-motion` fully honoured (reduced ≠ broken: same information, no
  motion); text contrast ≥ 4.5:1 at every animation frame the user can pause on.

## 2. Motion and feel

- Transitions 180–260ms, ease-out, translate ≤ 12px. Motion communicates hierarchy
  (what appeared, what completed) — never decoration for its own sake.
- State completions get a single satisfying beat: checkmark draw, chip colour settle,
  count-up on the elapsed-time headline. One beat, no confetti.
- Never animate layout under the pointer (no buttons that move while about to be
  clicked). Skeletons match final layout exactly to avoid reflow jumps.
- The landing's scroll scenes must hold 60fps on an M-series laptop; if a post-effect
  can't hold it, drop the effect, not the frame rate.

## 3. Demo choreography — the 3-minute judge arc

Design every screen so this exact sequence lands without narration:

1. **Landing (15s):** scroll tells Find → Connect → Deploy with zero black frames and
   readable copy at every scroll position. The Pinch mention at the Deploy station is
   the setup for the finale.
2. **Intake (20s):** judge (or presenter) types a REAL problem in plain language. The
   structured draft appears with extracted location/budget/urgency visibly correct —
   this is the "it understood me" moment. Missing-field chips make completeness a game,
   not a form.
3. **Research (25s):** the agent timeline streams — searched, read, considered,
   rejected-because. This is the "it's actually working" moment; it must feel alive
   (events arriving one by one, not dumped at once).
4. **Matches (20s):** three candidates with human-readable why-this-supplier reasons and
   honest risks. Registry entries ("responded to a previous requirement of yours") make
   the snowball visible if present.
5. **Outreach + supplier response (40s):** split-screen worthy — buyer sends, supplier
   tab opens from the private link, fixture-fill, submit, and the buyer workspace
   updates LIVE without refresh. This is the "it's a real two-sided system" moment.
6. **Comparison + selection (20s):** two visibly DIFFERENT responses side by side; one
   click selects; the engagement appears with the commitment milestone.
7. **Pinch finale (30s):** payment link created → hosted checkout → return page says
   "return proves nothing" → verified evidence flips the state to Supplier secured with
   the evidence panel showing HOW it was verified. This is the sponsor-criterion
   money shot; it must be impossible to miss.
8. **Speed receipt (10s):** the timestamped trail with the elapsed-time headline.
   Closing line of the demo, delivered by the UI itself.

Optimise ruthlessly for these eight beats. Any work that does not serve a beat is lower
priority than any work that does.

## 4. Numbers a judge can read from the back of the room

Elapsed time, match percentages, prices, and state chips are the demo's typography
heroes: large, high-contrast, never truncated, never `undefined`, never `NaN`, never a
raw ISO timestamp. Format money as `$4,200 AUD`, durations as `9m 41s`, timestamps as
`7:19 pm`. If a value can be pending, design the pending rendering explicitly (an em
dash and a label, not a blank).

## 5. Copy rules

Verbs for actions ("Analyse requirement", "Fund next milestone"), states as plain
outcomes ("Supplier secured", "Awaiting payment"), honesty labels short and calm
("Fixture research", "Live discovery", "Local demo only"). No exclamation marks, no
marketing adjectives inside the workflow, no jargon the buyer didn't type first. Every
truncation is word-boundary + ellipsis, everywhere, including PDFs and page titles.

## 6. Bugless mandate — the polish sweep

After both phases pass their specs, do one final full-app sweep with fresh eyes at
1280×720 and 375×812, dark room brightness: click every visible control on every
reachable screen (buyer, supplier, landing, sign-in stubs). Any control that does
nothing gets fixed or removed (product law: no dead controls). Any console error or
warning in the browser during the full arc is a defect — fix it. Any layout shift,
overlap, or sub-300ms flash of unstyled/empty content in the 8-beat arc is a defect —
fix it. Record the sweep's findings and fixes in the run report.
