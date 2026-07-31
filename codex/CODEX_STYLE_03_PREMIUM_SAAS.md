# Style Spec 03 — Premium SaaS (Linear/Stripe polish)

Branch: `style/premium-saas` — create it from the tip of `feature-polish`.

## Design idea

The product looks like a top-tier venture-grade SaaS: soft charcoal, one luminous
accent, generous whitespace, layered elevation, meticulous micro-interactions. The kind
of interface investors recognise instantly as "expensive". Calm confidence — nothing
shouts, everything glides. This is the safest crowd-pleaser of the five: judge-friendly,
familiar, immaculate.

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
--bg: #131316;
--surface: #1A1A1F;
--surface-raised: #212127;
--border: rgba(255,255,255,0.07);
--border-strong: rgba(255,255,255,0.14);
--text: #EDEDF2;
--text-secondary: #A2A2AE;
--accent: #7C5CFF;         /* electric violet */
--accent-soft: rgba(124,92,255,0.14);
--accent-2: #4CC3FF;       /* cyan, used only in gradients with --accent */
--ok: #3ECF8E;
--warn: #F5A623;
--info: #4CC3FF;
--danger: #FF6369;
--focus: #7C5CFF;
--radius: 14px;
--radius-small: 9px;
```

## Rules of form

- **Corners:** `--radius` on cards/panels, `--radius-small` on buttons/inputs/chips.
- **Elevation:** three layers — bg, surface (1px `--border`), raised (1px
  `--border-strong` + shadow `0 8px 24px rgba(0,0,0,0.32)`). Primary buttons and the
  active stepper segment get a soft accent glow (`0 0 0 1px --accent, 0 4px 20px
  rgba(124,92,255,0.25)`).
- **Gradient discipline:** exactly one gradient recipe, `linear-gradient(135deg,
  --accent, --accent-2)`, used ONLY for: primary button fill, active progress/receipt
  elapsed-time headline text (background-clip), and the match-percentage ring. Nowhere
  else.
- **Type:** existing sans; headings -0.02em; body relaxed 1.55 line-height; labels
  12px medium `--text-secondary` (sentence case, NOT uppercase); all numerics
  tabular-nums; hero numbers (elapsed time, price) 28-34px semibold.
- **Buttons:** primary = gradient fill, white text, `--radius-small`; hover lifts 1px
  with glow deepening (150ms); active presses back. Secondary = `--surface-raised` +
  1px border. Tertiary/link = accent text only. Disabled keeps adjacent explainers.
- **Badges/chips:** pill-shaped, tinted backgrounds at 14% alpha of their signal colour
  with matching text (ok/warn/info per live/fixture/local-demo), 1px border of the
  same colour at 30%. Verified payment = solid `--ok` pill, dark text.
- **Stepper:** rounded segmented control in a `--surface-raised` pill container;
  active segment = `--accent-soft` fill + accent text; completed = ok-tinted, still
  clickable with hover raise.
- **Inputs/forms:** `--surface` fields, 1px border, focus = accent ring
  (`0 0 0 3px rgba(124,92,255,0.28)`), labels above, helper text below in
  `--text-secondary`. The missing-fields counter becomes a subtle progress chip.
- **Timeline (agent activity):** vertical line with dot nodes; the newest event's dot
  pulses gently while loading; collapsed disclosure styled as a quiet card footer.
- **Comparison:** two equal cards; the selected radio state lifts the card (accent
  border + glow); price and availability as stat blocks; the "select" affordance
  obvious and satisfying.
- **Payment / evidence:** the evidence panel is a `--surface-raised` card with a green
  check medallion once verified; awaiting state shows a soft animated shimmer bar
  (reduced-motion: static).
- **Motion:** 180-220ms ease-out; card raise on hover 1-2px max; view transitions fade
  + 8px rise. Nothing loops except the loading shimmer and timeline pulse.

## Verification loop

1. Implement tokens first (swap `styles.css` custom properties), then walk EVERY view:
   intake, plan/report, candidates, outreach, compare, selected, payment, deployment,
   registry, receipt, supplier page, sign-in stubs. Restyle each to the rules above.
2. `npm test && npm run typecheck && npm run build` green.
3. Self-review pass against this file, checking every "Rules of form" bullet per view;
   fix; repeat until two consecutive clean passes.
4. Contrast-check every token pair used; record results in the final commit message.
5. Commit(s) on `style/premium-saas` with message prefix `style(saas):`.
