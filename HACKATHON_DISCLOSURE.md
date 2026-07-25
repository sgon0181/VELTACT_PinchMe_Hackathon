# Hackathon Disclosure

## What Is Implemented

- Buyer RapidMatch workflow for submitting an industrial requirement and reviewing a structured Need Profile.
- Deterministic supplier matching with explainable reasons.
- Secure supplier invitation links for the demo supplier response page.
- Standardised supplier response submission through the API.
- Buyer response comparison and supplier selection.
- Backend-owned engagement creation.
- Pinch sandbox hosted payment-link creation through the API.
- Backend webhook route that treats verified successful Pinch events as the authority for `supplier_secured`.

## Demo Constraints

- Persistence is in memory for the hackathon demo. Restarting the API clears needs, invitations, responses and engagements.
- Supplier outreach is represented by generated secure links in the buyer UI. SMS and email delivery are not implemented.
- The buyer UI polls backend state for supplier responses and payment status. Socket.IO events are also emitted by the API, but polling keeps the browser demo simple and reliable.
- Payment success is not faked in the browser. The buyer shows `supplier_secured` only when backend engagement state returns `supplier_secured` with `paymentStatus = "paid"`.

## Not Production Ready

- Add durable persistence, authentication, authorization, audit logging, production-grade webhook replay handling, supplier identity controls, and complete Pinch operational coverage before production use.
- Do not use demo invitation tokens, in-memory state, or local CORS settings in production.

