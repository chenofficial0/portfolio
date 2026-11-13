# CHEN. Zero-cost private media — implementation gate

Status: isolated design branch only. NOT deployed; no production or staging branch behavior changed.

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
1. Implement independent, tested blob store module and explicit per-user permission checks in Worker.
2. Ensure existing R2-only private media routes stay disabled until the KV implementation and tests pass.
3. Update draft reference validation and publishing plan for a new `private-kv/` prefix; never fall back to a public GitHub upload.
4. Add tests for unauthenticated access, origin, CSRF, upload MIME and magic bytes, size, deletion semantics, stale reads and quota failure modes.
5. Test in a local/emulated Worker and isolated namespace; inspect production and preview environment variables before deploying.
6. Confirm real billing plan is Workers Free, no R2 subscription, no optional pay-as-you-go feature.
7. Only after explicit review, deploy to development Worker with live publishing disabled.

## Limits checked on 2026-11-13
Cloudflare Workers KV Free: 1 GB total storage/account, 25 MiB maximum value, 100k reads/day, 1k writes/day, 1k deletes/day. Limits and pricing can change; recheck before deployment.
- https://developers.cloudflare.com/kv/platform/limits/
- https://developers.cloudflare.com/kv/platform/pricing/
- https://developers.cloudflare.com/kv/concepts/how-kv-works/
