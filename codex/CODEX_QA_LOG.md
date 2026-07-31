# Veltact User-Simulation QA Marathon

**Branch:** `qa/user-simulation`
**Base:** `feature-polish` at `5478cd2`
**Date:** 31 July 2026 (Australia/Sydney)
**Profile:** keyless fixture research/discovery, local-demo outreach and payment

## Safety and verification baseline

- `npm install`: dependencies already current; 0 audit vulnerabilities.
- Provider health confirmed `research=fixture`, `email=local_demo`, `sms=none`,
  `payment=local_demo`, with OpenAI and Pinch readiness false.
- Baseline gate: 268 tests passed; typecheck and production build passed.
- Landing implementation files are excluded from this QA branch.

## Cycle log

Each cycle records the human scenario, response variation, observations, fixes,
automated evidence, and browser retest result. A cycle is clean only when the
complete buyer and supplier journey finishes without functional, truthfulness,
accessibility, console, or responsive-layout defects.

### Cycle 1 — Darwin cold-store emergency (restart required)

- **Scenario:** A seafood cold store in Darwin, NT needed a licensed industrial
  refrigeration contractor within 12 hours for an ammonia compressor with severe
  vibration and low oil-pressure alarms; approval limit stated as AUD 28,000.
- **Planned supplier variation:** two suppliers able to help.
- **Defects at intake:** the deterministic adapter failed to identify the ammonia
  refrigeration equipment and licensed-contractor capabilities, used the generic
  `Industrial services` category and a truncated raw-input title, described a
  seafood cold store as a packaging context, and displayed singular/plural variants
  of the same missing capability as separate fields.
- **Fixes:** added industrial refrigeration extraction, title/category,
  urgency/capability and cold-storage constraint coverage; added semantic
  de-duplication for missing-field labels.
- **Regression coverage:** contracts extraction, API local-adapter and buyer
  missing-field tests. The gate now passes 271 tests plus typecheck and production
  build.
- **Browser retest:** the served keyless UI now reports 92% confidence, the specific
  ammonia system and compressor, five relevant capabilities, the industrial
  refrigeration category, one honest missing field (buyer email), and no console
  warning/error. Because a defect interrupted the journey, this cycle does not count
  as clean and will restart from intake.
