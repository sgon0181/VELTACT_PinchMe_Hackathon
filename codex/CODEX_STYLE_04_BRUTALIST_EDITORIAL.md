# Style Spec 04 — Brutalist Editorial (Ink & Ledger)

Branch: `style/brutalist-editorial` — create it from the tip of `feature-polish`.

## Design idea

Bold editorial confidence: warm paper, heavy ink, chunky borders, hard offset shadows,
huge headlines. The workflow reads like a beautifully typeset industrial ledger — every
supplier response a stamped entry, every payment a sealed record. Memorable and brave
where Spec 03 is safe; the one judges will remember at the end of a long demo day.
Playful in form, dead serious in information discipline.

## Scope and hard boundaries (identical across all style specs)

- Restyle ONLY the product surfaces: buyer workspace (`apps/buyer/public/index.html` +
  `apps/buyer/src/main.ts` rendered markup), supplier pages (`supplier.html`,
  `supplier-claim.html`), `signin.html`, `create-account.html`, and their shared
  `apps/buyer/public/styles.css` (+ `account.css` if touched).
- NEVER touch the landing: `landing.html`, `landing.css`, `assets/landing*.js`,
  `src/landing.ts`, `src/landingScene.ts`, `src/landingAssets.ts`. The landing is final.
- No functional changes. Markup edits are allowed only to add class hooks or reorder
  purely presentational wrappers. Every ARIA attribute, label, status string, form
  name, and data attribute stays byte-identical. Truthfulness badges (fixture / live /
  local demo / verified) must remain visually distinct and legible.
- All work on this style's own branch. `npm test && npm run typecheck && npm run build`
  green before every commit. Do not merge, push, or touch other branches.
- Accessibility floor: body text contrast >= 4.5:1, large text >= 3:1, visible focus
  rings, `prefers-reduced-motion` respected. Verify with computed contrast math for
  every token pair you define.

## Tokens

```css
--bg: #F7F2E9;             /* warm paper */
--surface: #FFFDF8;
--ink: #161513;
--ink-soft: #4E4B45;
--cobalt: #2242F5;         /* primary action */
--safety: #FF5A1F;         /* sparing highlight: warnings, fixture labels */
--ok: #157F3D;
--stamp-ok: #157F3D;
--rule: #161513;           /* borders ARE ink */
--focus: #2242F5;
--shadow: 4px 4px 0 var(--ink);
```

## Rules of form

- **Corners:** 0. **Borders:** 2px solid `--ink` on every card, panel, input, button.
- **Shadows:** hard offset only — `--shadow` on interactive cards and primary panels;
  NO blur anywhere. Hovering a card shifts it -1px/-1px and grows the offset to 5px;
  pressing a button removes the shadow and translates +2px/+2px (a physical stamp).
- **Type:** headlines huge and tight — `clamp(1.9rem, 3.5vw, 2.8rem)`, weight 800,
  -0.03em; a serif display stack (Georgia, "Times New Roman", serif) for view titles
  ONLY; everything else the existing sans. Labels 11px uppercase 0.1em. Numbers
  tabular; prices get the serif at stat size.
- **Colour discipline:** the page is ink-on-paper. `--cobalt` only for primary actions
  and links; `--safety` only for fixture labels and risk headings; `--ok` only for
  live/verified. Never more than one cobalt element per viewport-height of content.
- **Buttons:** chunky — 14px/22px padding, 2px ink border; primary = cobalt fill,
  paper text, hard shadow; secondary = paper fill, ink text. The stamp press on click
  is the signature interaction.
- **Badges/chips:** rubber-stamp aesthetic — 2px bordered uppercase labels, slightly
  rotated (-1deg) ONLY on the verified-payment stamp ("SUPPLIER SECURED" gets a 2px
  `--stamp-ok` double-border stamp, -2deg, on the evidence panel). All other chips
  stay straight.
- **Stepper:** ledger tabs — three heavy-bordered tabs butted together; active tab
  fills ink with paper text; completed tabs get a cobalt underline and stay clickable.
- **Timeline (agent activity):** numbered ledger lines with a 2px left rule; the
  "How these results were found" summary styled as a marginal note.
- **Comparison:** side-by-side ledger sheets; shared field labels between them; the
  chosen sheet gets the hard shadow and a cobalt corner flag.
- **Forms:** paper inputs with 2px ink borders; focus = cobalt border + 2px cobalt
  offset outline; missing-field chips are small stamped boxes.
- **Payment / evidence:** the certificate moment — evidence panel framed by a double
  2px border; verified flips in the rotated SUPPLIER SECURED stamp. Awaiting state is
  an empty dashed-border stamp outline reading AWAITING EVIDENCE.
- **Motion:** near none — the press/hover shifts (80ms steps, no easing curves needed)
  and view fades at 120ms. Reduced-motion: zero.

## Verification loop

1. Implement tokens first (swap `styles.css` custom properties), then walk EVERY view:
   intake, plan/report, candidates, outreach, compare, selected, payment, deployment,
   registry, receipt, supplier page, sign-in stubs. Restyle each to the rules above.
2. `npm test && npm run typecheck && npm run build` green.
3. Self-review pass against this file, checking every "Rules of form" bullet per view;
   fix; repeat until two consecutive clean passes.
4. Contrast-check every token pair used; record results in the final commit message.
5. Commit(s) on `style/brutalist-editorial` with message prefix `style(ink):`.
