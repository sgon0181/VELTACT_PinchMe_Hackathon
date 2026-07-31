# Style Spec 05 — Aurora Glass (Night Ops)

Branch: `style/aurora-glass` — create it from the tip of `feature-polish`.

## Design idea

A luminous night-operations console: deep space background, frosted-glass panels, and a
single aurora gradient (teal → azure → violet) that traces progress through the
workflow like light moving down the factory line. The most cinematic of the five and the
closest tonal sibling to the landing page — the dark 3D world continues seamlessly into
a glassy product. Futuristic, but disciplined: glass and glow are earned by state, not
sprinkled everywhere.

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
  every token pair you define (glass backgrounds included — compute against the
  effective composite colour).

## Tokens

```css
--bg: #070B14;
--bg-glow-1: rgba(45,224,200,0.07);   /* teal wash, top-left */
--bg-glow-2: rgba(139,92,246,0.06);   /* violet wash, bottom-right */
--glass: rgba(255,255,255,0.045);
--glass-strong: rgba(255,255,255,0.08);
--glass-border: rgba(255,255,255,0.12);
--text: #F2F6FF;
--text-secondary: #9FB0CC;
--aurora: linear-gradient(120deg, #2DE0C8 0%, #3B82F6 55%, #8B5CF6 100%);
--teal: #2DE0C8;    /* live / verified */
--azure: #3B82F6;   /* informational / local demo */
--violet: #8B5CF6;  /* selected / focus accents */
--warn: #F5B94B;    /* fixture / pending */
--danger: #FF6B7A;
--focus: #2DE0C8;
--radius: 18px;
--radius-small: 12px;
```

## Rules of form

- **Background:** `--bg` with two fixed radial washes (`--bg-glow-1`, `--bg-glow-2`)
  and a static 24px dot grid at 2.5% white. No parallax, no animation.
- **Glass:** panels = `--glass` + 1px `--glass-border` + `backdrop-filter: blur(14px)`
  + `--radius`. Raised/active panels use `--glass-strong`. Provide a solid-colour
  fallback (#101623) via `@supports not (backdrop-filter: blur(1px))`.
- **Aurora discipline:** the `--aurora` gradient appears ONLY as: (1) a 2px progress
  edge on the active stepper segment, (2) the primary button fill, (3) the elapsed-time
  headline on the speed receipt (background-clip: text), (4) a 1px top border on the
  view container that subtly shifts hue per phase (find=teal-end, connect=azure-mid,
  deploy=violet-end). Nowhere else — glow is earned, not ambient.
- **Type:** existing sans; headings light-tracked (-0.01em) and slightly lighter
  weight than today (600 max); labels 11px, 0.08em, `--text-secondary`; numerics
  tabular; receipt/elapsed numbers 30px.
- **Buttons:** primary = aurora fill, deep-navy text (#06101E), `--radius-small`,
  hover adds `0 0 22px rgba(45,224,200,0.35)` glow (150ms); secondary = glass with
  border; ghost = text + teal underline on hover. Disabled: glass at 50% with the
  adjacent explainer text kept.
- **Badges/chips:** glass pills with signal-coloured text and 30%-alpha borders:
  live/verified = `--teal`, fixture/pending = `--warn`, local demo = `--azure`.
  Verified payment = solid teal pill with navy text plus a soft teal outer glow — the
  single strongest glow in the app.
- **Stepper:** a glass rail; each segment a rounded glass tab; the active tab carries
  the aurora bottom edge; completed tabs get a teal check dot and remain clickable.
- **Timeline (agent activity):** a glowing thread — 2px vertical line in teal at 40%,
  nodes as 8px teal dots; while loading, the newest node breathes (scale 1→1.25, 1.8s).
  Reduced-motion: static.
- **Comparison:** glass cards; selecting one ignites its border with the violet end of
  the aurora + lift; price as the hero stat with a soft text glow.
- **Payment / evidence:** awaiting = glass panel with a slow teal border shimmer
  (reduced-motion: static border); verified = the teal-glow evidence pill + medallion
  check. The deploy view's milestone list lights each funded milestone's node teal so
  progress literally travels down the line.
- **Motion:** 200-260ms ease-out fades/rises; the node breathing and border shimmer
  are the only loops; everything obeys reduced-motion.

## Verification loop

1. Implement tokens first (swap `styles.css` custom properties), then walk EVERY view:
   intake, plan/report, candidates, outreach, compare, selected, payment, deployment,
   registry, receipt, supplier page, sign-in stubs. Restyle each to the rules above.
2. `npm test && npm run typecheck && npm run build` green.
3. Self-review pass against this file, checking every "Rules of form" bullet per view;
   fix; repeat until two consecutive clean passes.
4. Contrast-check every token pair used (composite the glass alpha over `--bg` before
   computing); record results in the final commit message.
5. Commit(s) on `style/aurora-glass` with message prefix `style(aurora):`.
