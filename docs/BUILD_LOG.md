# Veltact 2.0 Build Log

This log records autonomous build loops for the `codex/veltact-2-find-connect-deploy`
branch. A loop is only complete after implementation, automated verification, and
an explicit note about remaining risk.

## 2026-07-26 - Baseline and Scope Lock

### Inspected

- Confirmed `main` and `origin/main` at `fa2b848`.
- Created `codex/veltact-2-find-connect-deploy` from that commit.
- Preserved the previous buyer design preview as
  `docs/design/buyer-workspace-preview.html` so it is not served as a product page.
- Read the existing product, architecture, integration, disclosure, outreach, and
  security documentation.
- Reviewed the current contracts, API, buyer and supplier flows, AI intake,
  outreach adapters, persistence, realtime events, and Pinch integration.

### Verified

- `npm install`: passed with zero reported vulnerabilities.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed, 28 tests.
- `npm run build`: passed.

### Decisions

- Preserve the existing Express, vanilla TypeScript, Zod, Socket.IO, npm
  workspaces, OpenAI, outreach, and Pinch implementation.
- Add Veltact 2.0 as an incremental Find, Connect, Deploy workflow.
- Keep Australia and AUD as the initial operating boundary.
- Require buyer approval before supplier outreach.
- Treat public-web supplier information as discovery evidence, not verification.
- Treat Pinch Payment Links as milestone billing, not escrow.
- Keep deterministic demo fixtures available when external providers are absent.

### Next Loop

Define V2 shared contracts, lifecycle rules, API/event names, and a versioned
atomic JSON repository with validation and deterministic reset support.
