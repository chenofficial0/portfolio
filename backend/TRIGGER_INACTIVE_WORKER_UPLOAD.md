# CHEN. Inactive Worker Version Upload — Explicit Owner Authorization

Owner confirmed that the single-Worker scoped Editor token is saved as the
GitHub Actions Secret `CLOUDFLARE_WORKER_EDITOR_TOKEN`.

Date: 2026-11-13.
Worker: `chen-content-studio-api`.
Allowed operation: upload a **non-deployed Worker version only** via
`wrangler versions upload` after configuration and security checks.
Forbidden operations: `wrangler deploy` (except `--dry-run`),
deploying traffic, merging main, changing runtime feature flags,
deleting photos or drafts, publishing the public site.

All experimental private storage, media writes and publishing flags remain OFF.
