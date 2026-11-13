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

## Private draft isolation — development implementation (2026-11-13)
- New `backend/src/private-kv-draft.js` supports explicit one-time initialization, read, validation, bounded JSON writes, SHA-256 content revision and stale-version refusal.
- Worker `GET /api/content`, `PUT /api/content`, and `GET /api/preview-content` use private KV *only* when `ENABLE_PRIVATE_DRAFTS=true`; missing private data causes a 503 with **no public GitHub fallback**.
- When private draft mode is enabled, both release planning and release confirmation fail closed. Publication from the private draft will need a separate, audited design.
- Private media deletion checks references in whichever draft backend is active.
- `backend/wrangler.toml` on this isolated branch defaults `ENABLE_PRIVATE_DRAFTS=false`, `ENABLE_MEDIA_UPLOADS=false`, `ENABLE_KV_MEDIA_UPLOADS=false`, `ENABLE_KV_MEDIA_DELETES=false`. Do not change these settings in a live environment now.
- Existing GitHub staged data and the two portraits are NOT migrated or deleted by this commit.
- Important: KV revisions are NOT atomic compare-and-swap. Concurrent editor sessions may overwrite each other despite SHA checks. Before enabling writes, implement a serialized writes layer (for example a free-tier-supported transactional service after verifying pricing) or another safely constrained design. Single editor credentials alone do not eliminate multiple-device concurrency.
- Private draft data should not be initialized automatically from a publicly accessible Git branch. Migration needs explicit review of exact source, export, destination, backup, image references and rollback.
- Existing public Git commits remain publicly accessible; moving newer copies to private KV does not erase historical exposure.
- Tests `backend/private-kv-draft.test.mjs`, `backend/private-kv-media.test.mjs`, and `backend/zero-cost-security.test.mjs` have been created but not run on this branch. Environment couldn't download repo sources for a local test, so treat results as UNVERIFIED.

## Concurrent edit protection — immutable revision trial (2026-11-13)
- Experimental `backend/src/private-kv-revisions.js` creates one **new** random KV key per revision. Two edits from the same parent can coexist without overwriting the parent's data. Keys are never intentionally reused or deleted by the journal.
- `GET /api/draft/revision?id=...` fetches a specific version after normal editor authentication. `POST /api/draft/revision` appends a new version with Origin, CSRF, session, schema and size checks. Both require `ENABLE_IMMUTABLE_DRAFTS=true`, which is **false** by default.
- The current `GET/PUT /api/content` UI workflow remains unchanged. No automatic switch to immutable mode, no automatic migration, and no publication from immutable revisions.
- An immutable revision journal prevents overwriting old version keys. It does **not** automatically detect or reconcile competing edits, guarantee immediate visibility across Cloudflare regions, or impose an atomic account-wide quota.
- A future UI must explicitly select a revision, show competing children, and require manual reconciliation before designating a release candidate. Do not pick a "latest" entry by timestamp alone.
- Each append consumes KV storage and one write. Add retention and owner-approved cleanup policy after backup; do not enable unlimited append.
- Tests in `backend/private-kv-revisions.test.mjs` and `backend/zero-cost-security.test.mjs` were committed but are **not recorded as executed**.
- Keep `ENABLE_LIVE_PUBLISH=false`, `ENABLE_MEDIA_UPLOADS=false`, and `ENABLE_IMMUTABLE_DRAFTS=false`. No paid service is enabled by this branch.

## Testing and fail-closed changes (2026-11-13)
- Added `.github/workflows/zero-cost-backend-tests.yml` with standard `ubuntu-latest` runner and Node 22, scoped to this feature branch. No paid/larger runners, secrets, caches, deployments, or artifacts.
- GitHub Actions run status could not be independently confirmed through current connector results; treat tests as **NOT VERIFIED PASSED**. Inspect Actions results before merging.
- Changed Worker `PUT /api/content` so `ENABLE_PRIVATE_DRAFTS=true` now refuses mutable private draft writes (HTTP 403) rather than using KV's non-atomic overwrite path. An immutable revision endpoint remains experimental and disabled.
- Older `private-kv-draft.js` remains a non-live prototype for migration tests. It must NOT be promoted as concurrency-safe.

## Draft comparison development (2026-11-13)
- `backend/src/private-kv-compare.js` is a pure three-way JSON comparison module. It reports field changes as `left-only`, `right-only`, `same-change` or `conflict`; arrays (photos, filmography) are treated as indivisible because array index position is not a stable item identity.
- `GET /api/draft/compare?base=...&left=...&right=...` requires an authenticated approved editor and both `ENABLE_IMMUTABLE_DRAFTS=true` and `ENABLE_REVISION_COMPARISON=true`, which remain **false** in the independent development branch.
- The comparison accepts only two direct children of the same parent revision. It neither merges nor publishes anything.
- Scalar preview text is truncated to 240 characters in the response; read-only API results are still private information and must never be cached publicly.
- Next: explicit visual conflict selection UX and safe identity-based handling of filmography/gallery records. Never auto-merge arrays or release without acceptance.
- CI includes `backend/private-kv-compare.test.mjs` and Worker-level authorized comparison regression cases. Review the run for the latest commit before calling it passed.
