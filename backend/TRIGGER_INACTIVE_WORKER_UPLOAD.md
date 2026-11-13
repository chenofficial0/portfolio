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

## Second upload authorization — latest private publication/rollback build
- Date: 2026-11-13
- Tested rehearsal: https://github.com/chenofficial0/portfolio/actions/runs/43411875977
- Complete regression: https://github.com/chenofficial0/portfolio/actions/runs/43411875817
- Upload a new **inactive** Worker version only using already-scoped Worker Editor token.
- All private publishing and rollout flags remain false. Do not deploy or change traffic.
- Prior inactive version v84 remains available; do not retry the original partial upload.
