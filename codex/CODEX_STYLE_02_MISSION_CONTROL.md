# Style Spec 02 — Mission Control (Industrial HMI)

Branch: `style/mission-control` — create it from the tip of `feature-polish`.

## Design idea

The workspace becomes a control room: a dark, dense, instrument-grade HMI where the
buyer monitors an operation in progress. Statuses read like telemetry, live regions
pulse like consoles, and the Pinch verification is a green board light. Tasteful SCADA —
never kitsch: no scanline gimmicks, no CRT noise, just the calm authority of a system
that is clearly running.

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
--bg: #0A0E13;
--panel: #101720;
--panel-raised: #16202B;
--grid-line: #1C2733;
--text: #E6EEF2;
--text-dim: #8DA2B0;
--signal-ok: #35D07F;      /* live / verified */
--signal-warn: #FFB020;    /* fixture / pending */
--signal-info: #39C6D8;    /* local demo / informational */
--signal-alert: #FF5C5C;   /* errors only */
--accent: #E2493B;         /* landing red, reserved for primary actions */
--focus: #39C6D8;
--mono: ui-monospace, "JetBrains Mono", "SF Mono", Menlo, monospace;
```

## Rules of form

- **Corners:** 4px max. Panels are 1px `--grid-line` bordered with corner tick marks
  (6px L-shaped pseudo-elements in each corner) on major sections only.
- **Elevation:** no soft shadows; raised panels use `--panel-raised` + border. A faint
  1px top highlight (rgba(255,255,255,.05)) is allowed.
- **Background texture:** a barely-visible blueprint grid on `--bg` (CSS gradient
  lines at 24px spacing, <=3% alpha). Static; no animation.
- **Type:** section labels and ALL data values (ids, prices, timestamps, percentages,
  confidence) in `--mono`, uppercase labels at 10px/0.14em. Prose (summaries,
  requirement text) stays in the existing sans for readability. Numbers tabular.
- **Status lights:** every state chip gets a leading 7px LED dot in its signal colour;
  live-updating regions (outreach waiting, awaiting payment) pulse the dot at 1.6s
  ease-in-out (opacity 0.4-1.0). Reduced-motion: dot static.
- **Buttons:** primary = `--accent` fill, 4px radius, mono uppercase label; hover
  brightens and adds a 1px `--signal-info` outline. Secondary = transparent, 1px
  `--grid-line` border, `--text` label. Disabled keeps the adjacent explainer text.
- **Stepper:** a segmented progress rail: three labelled segments [01 FIND][02
  CONNECT][03 DEPLOY]; active segment fills `--accent` at 15% with a solid bottom
  edge, completed segments get a `--signal-ok` bottom edge and stay clickable.
- **Timeline (agent activity):** console feed — mono, prefixed `>` per event,
  timestamps right-aligned, newest event briefly highlighted (background fade 800ms).
- **Comparison:** instrument cards — each supplier is a panel with a mono header bar
  (name + match % as a right-aligned gauge chip). Price rendered as the biggest mono
  figure on the panel.
- **Payment / evidence:** a "verification board": AWAITING = amber LED pulsing;
  webhook/reconciliation evidence flips it to a solid green LED row with mono evidence
  id, source, timestamp. This must be the most satisfying state change in the app.
- **Motion:** 160ms linear for panel/state transitions; the LED pulse and the single
  feed highlight are the only continuous animations. Reduced-motion: all off.

## Verification loop

1. Implement tokens first (swap `styles.css` custom properties), then walk EVERY view:
   intake, plan/report, candidates, outreach, compare, selected, payment, deployment,
   registry, receipt, supplier page, sign-in stubs. Restyle each to the rules above.
2. `npm test && npm run typecheck && npm run build` green.
3. Self-review pass against this file, checking every "Rules of form" bullet per view;
   fix; repeat until two consecutive clean passes.
4. Contrast-check every token pair used; record results in the final commit message.
5. Commit(s) on `style/mission-control` with message prefix `style(hmi):`.
