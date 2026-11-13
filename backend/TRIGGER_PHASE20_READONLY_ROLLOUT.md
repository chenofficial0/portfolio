# Phase 20 — authenticated private editor READ-ONLY deployment authorization

Owner asked ChatGPT to continue the website tests through launch. This trigger
authorizes safe deployment of the **already uploaded and audited** read-only
private Studio Worker version `6bdc091b-08a8-44d6-a418-4d94e5eb25a7`.

Release invariants:
- 100% live traffic must currently be v85; do not deploy if drifted.
- Authenticated private draft listing/preview only; **private draft writing
  completely OFF**, as are image uploads, media deletion, GitHub main writes,
  and private public publishing/revert.
- Anonymous private editor, private photos, and private content deny access.
- On any post-rollout smoke failure, restore v85.
- No GitHub main change, no private KV modifications, no public photo publication.

Date: 2026-11-13.
