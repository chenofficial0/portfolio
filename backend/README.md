# CHEN. Content Studio — Phase 2 secure publishing API

Status: **Cloudflare Worker / Content Studio staging is in acceptance testing; live publishing remains disabled.** This document describes the development branch only. Confirm actual online configuration in Cloudflare Dashboard before trusting deployment state. Do not publish test content to GitHub Pages during security checks.

## Why a separate backend?

GitHub Pages serves public static files. GitHub OAuth's client secret and write tokens **must not** appear in published HTML/JS. The Worker handles authentication and GitHub writes on the server only. Browser-visible Content Studio is at the Worker same-origin `/studio` route to avoid third-party cookie restrictions.

## What this code provides

- GitHub OAuth app authorization-code flow; random state, short-lived KV state, HTTP-only secure session cookie.
- Approved editor is limited to `chenofficial0`, verified against GitHub identity **and** repository push permission.
- Session tokens stored encrypted using Worker secret AES-GCM key; raw access tokens are never returned to the browser.
- `GET /api/session`, `GET /api/content`, `PUT /api/content`, `POST /api/logout`.
- Content payload validation, optimistic concurrency based on GitHub file SHA, same-origin check and CSRF header on writes.
- `GET /studio` serves the branded client HTML from your public GitHub Pages site under the Worker origin.

Not yet included: direct photo/PDF upload, GitHub App fine-grained installation permissions, full automated tests, production monitoring. No secrets or Cloudflare account access are connected here.

## Deployment prerequisites (requires your Cloudflare and GitHub owner account)

1. Create a Cloudflare account or use an existing one. Set up a Worker under `backend/`. Cloudflare's secure server-side storage must be configured by the account owner.
2. Create a GitHub **OAuth App** in GitHub Developer Settings (not a personal access token). Homepage: `https://chenofficial0.github.io/portfolio/`; Authorization callback: `https://<your-worker-host>/auth/callback`. Select least scope supported by this OAuth app: `public_repo read:user` on login. Note that OAuth app scopes are broader than repo-specific GitHub App permissions; consider moving to a repo-limited GitHub App before long-term production use.
3. In a local checkout of `backend/`, run `npx wrangler login` and `npx wrangler kv namespace create STUDIO_KV`. Copy the returned namespace ID into `wrangler.toml`.
4. Fill `PUBLIC_API_ORIGIN` with exact deployed HTTPS Worker origin (no slash at end) and `GITHUB_CLIENT_ID` with the OAuth App client ID. These two values are public configuration, not secrets.
5. Add secrets using Cloudflare's dashboard or `npx wrangler secret put GITHUB_CLIENT_SECRET` and `npx wrangler secret put SESSION_ENCRYPTION_KEY`. The encryption key must be **32 cryptographically random bytes encoded in base64**. Generate locally using a password manager or trusted cryptographic tool; never paste these secrets into chat or GitHub.
6. Run `npx wrangler deploy` inside `backend/`. Check that the deployment hostname is exactly the hostname configured in `PUBLIC_API_ORIGIN` and the GitHub OAuth callback.
7. Open the Worker `/studio`, sign in with the approved GitHub account, and verify draft save, draft preview, and media upload **on the staging branch only**. Do not invoke `/api/publish/confirm` or enable publishing.
8. Verify access rejection, expired sessions, mismatched CSRF, invalid media, and stale file SHA using safe read-only requests or isolated tests. Compare deployed Cloudflare Variables / Secrets and KV bindings with this configuration, without exposing secret values. Verify that `content/site.json` contains no secrets.

**Live publishing must remain disabled unless the owner explicitly approves it after a separate production-readiness review.** Passing tests or checking an acceptance box does not authorize publication.

## Security acceptance status (2026-11-13)

- Owner reported passing the previous Content Studio and cross-device user acceptance checks.
- Static checks and isolated negative-path tests passed for input validation, cross-origin writes, and the `ENABLE_LIVE_PUBLISH = "false"` early rejection. This is **not** a live Cloudflare or penetration test.
- The deployed Worker's actual Variables / Secrets / KV bindings and deployed code version have **not** been independently inspected here. The Cloudflare dashboard owner must check them directly.
- Expected: `PUBLIC_API_ORIGIN` matches the Worker host; `STUDIO_KV` is bound to the intended namespace; `GITHUB_CLIENT_SECRET` and `SESSION_ENCRYPTION_KEY` exist as **secrets** (never paste or reveal values); `ENABLE_LIVE_PUBLISH` is `false` in the deployed environment and all applicable environment overrides.
- Isolated tests are not a substitute for checking actual unauthenticated API rejection, OAuth allowlisting, expired cookies, CSRF failures, stale SHA conflict, and safe media rejection in the deployed environment. Use only authorized test accounts, no production writes, and never invoke an actual publish action.
- Existing OAuth scope `public_repo read:user` has broad repository access. Review migration to a repository-restricted GitHub App before production readiness.

## Rollback and safety

The existing `admin/index.html` and `admin/config.yml` (Decap Turbo) are untouched. The current public homepage is unaffected by the Worker until content is explicitly published. Every publish creates a GitHub commit; revert that commit if needed. Keep `main` branch protection and backups.

## APIs

- `GET /auth/login`: begins GitHub authentication. Uses state cookie, KV.
- `GET /auth/callback`: exchanges GitHub code server-side; checks GitHub account login and push permission.
- `GET /api/session`: only returns `authenticated`, `login`, and CSRF nonce; never returns an access token.
- `GET /api/content`: authorized view of `content/site.json` plus its GitHub blob SHA.
- `PUT /api/content`: JSON `{ "sha": "...", "data": { ... } }` with `X-CHEN-CSRF` header. Writes only to `content/site.json`.
- `POST /api/logout`: invalidates session.

The browser Studio sends the request to the same Worker origin. The GitHub Pages hosted copy remains a *preview only* with import/export.

## Future work

- Direct upload endpoint with strict file size, MIME signature and filename validation; image/PDF sanitization.
- Move to fine-grained GitHub App permissions and release-time audit.
- Add integration tests and monitoring, formal data schema, and accessible draft preview.

Deployment verification: Cloudflare Builds is connected to this feature branch; confirm a GitHub-triggered build completes successfully before OAuth testing.
