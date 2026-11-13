# CHEN. Zero-cost private media — implementation gate

Status: isolated development branch; read-only authenticated KV preview integration committed to Worker source. NOT deployed; no production or staging branch behavior changed.

## Non-negotiable constraints
- Use existing Workers Free and Workers KV Free; do not enable R2, billing, paid storage, or automatic paid upgrades.
- Do not modify the existing GitHub Pages `main` branch or publish unapproved content.
- Keep `ENABLE_LIVE_PUBLISH=false` and `ENABLE_MEDIA_UPLOADS=false` in the deployed Worker while this migration is in development.
- Preserve the two currently referenced photos. Never automatically remove existing files or rewrite Git history.
- Do not put unpublished images, PDFs, or draft content into any publicly readable Git branch.
- Do not log photos, tokens, or session secrets.

## Storage plan
- Use a separate KV namespace binding `PRIVATE_DRAFT_KV` rather than reusing `STUDIO_KV` sessions. Both may run on Workers Free; the 1 GB storage quota applies across the account.
- Keep opaque media identifiers independent of published filenames.
- Cap accepted post-transformation image size to 1 MiB, with server-side signature checks; reject unsupported formats and oversized bodies before persisting.
- Start with a voluntary 100 MiB media budget, but **do not claim a strict atomic quota** using KV alone: concurrent writers and delayed reads make a counter unreliable. Use tracked inventory and fail-closed review when usage is uncertain.
- Return private media only after authenticated session and approved-editor checks. Use `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.
- Separate "remove reference from draft" from "delete stored object"; never represent either as historical Git erasure.
- Because KV is eventually consistent, deleted objects or revoked access may remain observable briefly in some regions. Do not guarantee immediate global deletion or high-confidentiality erasure based only on KV.
- Use a private, separately protected backup/export process before destructive maintenance; do not place backups in public GitHub.

## Integration gates (not yet done)
1. Private KV blob adapter and authenticated preview route are now linked in development code; execute tests before calling them verified. Upload/delete routes are NOT enabled. Session and existing preview endpoint gate reads.
2. Ensure existing R2-only private media routes stay disabled until the KV implementation and tests pass.
3. Private KV draft references are recognized and mapped to authenticated preview; private-KV publish plans and confirmations are explicitly rejected pending a separately reviewed release implementation. Never fall back to public GitHub upload.
4. Add tests for unauthenticated access, origin, CSRF, upload MIME and magic bytes, size, deletion semantics, stale reads and quota failure modes.
5. Test in a local/emulated Worker and isolated namespace; inspect production and preview environment variables before deploying.
6. Confirm real billing plan is Workers Free, no R2 subscription, no optional pay-as-you-go feature.
7. Only after explicit review, deploy to development Worker with live publishing disabled.

## Limits checked on 2026-11-13
Cloudflare Workers KV Free: 1 GB total storage/account, 25 MiB maximum value, 100k reads/day, 1k writes/day, 1k deletes/day. Limits and pricing can change; recheck before deployment.
- https://developers.cloudflare.com/kv/platform/limits/
- https://developers.cloudflare.com/kv/platform/pricing/
- https://developers.cloudflare.com/kv/concepts/how-kv-works/

## Implemented in isolated branch (2026-11-13)
- `backend/src/private-kv-media.js`: independent store, read and delete primitives; not wired to upload/delete routes.
- `backend/src/worker.js`: `private-kv/` draft validation, authenticated private photo preview, explicit private-KV release lock. Legacy staged photos remain readable by existing path.
- `backend/zero-cost-security.test.mjs`: added authenticated KV preview and fail-closed checks. Tests have **not been executed**; commits do not equal passing test results.
- Cloudflare is not provisioned with `PRIVATE_DRAFT_KV`, and no deployed Worker has been updated.

### Remaining blockers before any upload activation
- No race-safe aggregate capacity enforcement yet; do not enable private KV writes with this adapter alone.
- Need draft lifecycle, deletion confirmation, orphan detection and cleanup policy.
- Need local test execution and complete permission, MIME, path, billing and concurrency verification.
- Need explicit user acceptance before any Worker or website deployment.

## Development update — private KV upload/delete API (not deployed)
- `POST /api/media/private`: JPEG-only, 1 MiB maximum after processing, valid image markers, same-origin, editor session and CSRF. Requires both `ENABLE_MEDIA_UPLOADS=true` and new `ENABLE_KV_MEDIA_UPLOADS=true`; these remain OFF in the deployed Worker.
- Conservative inventory guard requires per-object byte metadata; it rejects missing metadata, paginated inventories larger than reviewed bound, >=50 objects, or >50 MiB staged total. This guard is **not atomic** under concurrency and must not be described as a guaranteed hard limit. KV Free account limits remain the ultimate free-tier boundary.
- `DELETE /api/media/private`: requires separate `ENABLE_KV_MEDIA_DELETES=true`, valid session, origin, CSRF, an exact private path, confirmation phrase, and a currently saved draft with no reference to the file. Deletion does not rewrite Git history and KV propagation may be delayed.
- Deleting one blob cannot establish whether copies were kept elsewhere or on prior public Git branches.
- No UI delete controls have been wired. Do not enable upload or deletion flags yet.
- All changes remain exclusively on `feature/zero-cost-private-media`; never merge or deploy without tests and explicit review.
- Isolated test files have been updated but have **not been executed**.
