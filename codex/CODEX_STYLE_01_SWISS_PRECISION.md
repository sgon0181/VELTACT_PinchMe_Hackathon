# Style Spec 01 — Swiss Precision (Engineering Paper)

Branch: `style/swiss-precision` — create it from the tip of `feature-polish`.

## Design idea

The product becomes a precision engineering document: light, paper-like, grid-forward,
typographically strict. Think Swiss International Style — Braun manuals, rail
timetables, technical drawings. Authority through restraint. The landing page's
industrial red survives as the single accent, so the dark landing hands off to a bright,
exacting workspace like a factory floor opening into a drafting office.

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
--bg: #F4F2ED;            /* warm paper */
--surface: #FFFFFF;        /* cards */
--surface-recessed: #ECE9E2;
--ink: #131316;            /* primary text */
--ink-secondary: #55555C;
--rule: #D8D4CB;           /* hairlines */
--accent: #D2402F;         /* industrial red, ties to landing */
--accent-ink: #FFFFFF;
--ok: #1E7A44;
--warn: #9A6B1A;
--info: #23527C;
--focus: #131316;
```

## Rules of form

- **Corners:** 0px everywhere. 2px maximum on tiny chips if 0 looks broken.
- **Elevation:** none. No box-shadows. Hierarchy comes from 1px `--rule` hairlines,
  spacing, and type weight. Cards are white rectangles with hairline borders.
- **Grid:** make the grid visible. On >=1100px viewports, main sections align to a
  12-column grid; add faint vertical column rules inside the report card (1px,
  `--rule` at 40% alpha) so the page reads like a drafting sheet.
- **Type:** keep the existing font stack but tighten it: eyebrows/labels 10-11px
  uppercase letter-spacing 0.12em `--ink-secondary`; headings tight (-0.02em), never
  bold+huge together — use size OR weight; ALL numbers (prices, percentages, elapsed
  times) tabular-nums.
- **Buttons:** rectangles. Primary = `--accent` fill, white text, no radius; hover =
  darken 8%, no motion. Secondary = white with 1px ink border. Disabled = recessed
  surface + secondary ink + the explanatory adjacent text the product already uses.
- **Badges/chips:** 1px bordered rectangles, uppercase, 10px. Live = `--ok` border/text.
  Fixture = `--warn`. Local demo = `--info`. Verified payment = solid `--ok` fill,
  white text — the only solid chip, so verification pops.
- **Stepper:** technical-drawing annotation style: number in a 1px-bordered square,
  hairline connector, active step gets an `--accent` square and underline. Completed
  steps keep their clickable affordance (underline on hover).
- **Timeline (agent activity):** ledger rows — sequence number in a bordered square,
  hairline between rows, timestamps right-aligned tabular.
- **Comparison cards:** two columns rendered like a spec-sheet table: shared field
  labels in a left rail, values ruled with hairlines. Price is the largest number on
  the card.
- **Payment / evidence panel:** frame it like a certificate block: double hairline
  border (1px + 1px offset 3px), verified state stamps the solid green chip.
- **Motion:** 120ms opacity/underline only. No translates. Reduced-motion: none at all.

## Verification loop

1. Implement tokens first (swap `styles.css` custom properties), then walk EVERY view:
   intake, plan/report, candidates, outreach, compare, selected, payment, deployment,
   registry, receipt, supplier page, sign-in stubs. Restyle each to the rules above.
2. `npm test && npm run typecheck && npm run build` green.
3. Self-review pass against this file, checking every "Rules of form" bullet per view;
   fix; repeat until two consecutive clean passes.
4. Contrast-check every token pair used; record results in the final commit message.
5. Commit(s) on `style/swiss-precision` with message prefix `style(swiss):`.
