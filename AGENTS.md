# AGENTS.md — Veltact Overnight Autopilot Directives

> **STATUS (2026-07-31):** Phase A (`codex/CODEX_FIX_SPEC_30-JUL-NIGHT.md`) and Phase B
> (`codex/CODEX_FEATURE_SPEC_FEATURE-POLISH.md`) are COMPLETE on `feature-polish` —
> see `codex/CODEX_RUN_REPORT.md`. Do not redo them. Active work is whatever the
> operator's current task prompt assigns (e.g. the QA marathon or the style specs in
> `codex/CODEX_STYLE_0*.md`). The autonomy contract, verification loop, and hard
> boundaries below still govern ALL work in this repo.

You (Codex) are running an UNATTENDED OVERNIGHT SHIFT. The operator is asleep and will
review in the morning. Your mission is to complete, verify, and polish the two
specification files below to hackathon-final quality. Work as far and as hard as the
specs allow. Do not stop to ask questions — every question you would ask has an answer
in the documents below, and where it genuinely does not, make the spec-compliant choice,
record it in `codex/CODEX_RUN_REPORT.md`, and keep moving.

## Authority order (highest first)

1. `codex/CODEX_FIX_SPEC_30-JUL-NIGHT.md` — Phase A. Correctness and demo-credibility fixes.
   Branch: `30-jul-night`.
2. `codex/CODEX_FEATURE_SPEC_FEATURE-POLISH.md` — Phase B. The snowball feature set.
   Branch: `feature-polish` (created from the finished `30-jul-night`).
3. `codex/CODEX_UX_DEMO_ADDENDUM.md` — cross-cutting HCI / UI / UX / demo-choreography
   standards. Apply to EVERYTHING you touch in both phases.
4. `docs/PRODUCT.md` — product boundary and truthfulness rules. Never violate these,
   even where a spec could be read otherwise.

## Autonomy contract

- Full autonomy is granted for: editing any file in this repo, creating branches named
  in the specs, committing, installing npm dependencies needed by the specs, running
  servers/tests/scripts locally, and calling the Pinch SANDBOX.
- Forbidden regardless of autonomy: pushing to `main` or merging into it; force-push or
  history rewriting; deleting branches you did not create tonight; committing secrets
  or `.env`; live (non-sandbox) payment credentials; disabling or skipping tests to get
  green; weakening fixture/live/local-demo truthfulness labels; deleting user data
  files (`apps/api/.data/`) except via the documented demo-reset script.
- Blocked >30 minutes on one item? Implement its degraded/keyless form, log it in the
  run report, move on. A finished, green, honest subset beats a broken superset.

## Recursive verification loop (mandatory, per feature/fix)

Repeat until you get TWO consecutive fully-clean passes:

1. Implement.
2. `npm test && npm run typecheck && npm run build` — all green.
3. SELF-DEMO: start the app (`npm run dev`), and drive the affected flow end-to-end the
   way a judge would — via the HTTP API (curl the canonical flow: intake → analyse →
   find suppliers → outreach → both supplier submissions via their token URLs →
   compare → select → payment link) and by loading the built pages. Use the gearbox
   smoke string from the fix spec AND one novel requirement you invent fresh each pass
   (different industry, different phrasing) — the app must never look hardcoded.
4. Any defect found — functional, visual, copy, console error, broken label — fix it
   and restart the loop for that feature.
5. On the second consecutive clean pass: commit with a descriptive message and move on.

Full-suite regression gates: after each PHASE (not just each feature), rerun the entire
test suite, `npm run demo:reset` and `npm run demo:reset -- --robotics`, and the two
demo buttons' flows. The deterministic demos must never drift.

## End-of-shift protocol

1. All Phase A work committed on `30-jul-night`; `feature-polish` created from its tip;
   all Phase B work committed on `feature-polish`.
2. Write and commit `codex/CODEX_RUN_REPORT.md` (in `codex/`): per-item status
   (done/partial/skipped + reason), decisions made where specs were open-ended, new env
   vars, new endpoints, test counts before/after each phase, known remaining issues
   ranked by demo risk, and a step-by-step MORNING SMOKE CHECKLIST for the operator
   (including where to paste the OpenAI key and how to verify live discovery and a
   sandbox milestone payment).
3. Leave the working tree clean (everything committed) and the repo on `feature-polish`.
