# CHEN. Content Studio — architecture and security

## Phase 1 (implemented)
- The existing GitHub Pages website reads content/site.json.
- The legacy Decap Turbo admin at admin/index.html and admin/config.yml remains unchanged.
- New custom studio is admin/studio.html: publicly reachable, unauthenticated editing preview.
- Studio can load public JSON, edit in browser memory, import JSON, and export a JSON backup. No GitHub write, uploads, or private login.
- Never enter secrets, passwords, GitHub tokens, or confidential information in static GitHub Pages files.

## Secure production architecture (not yet implemented)
Browser → trusted OAuth/backend (separately hosted e.g. Cloudflare Workers) → GitHub App or scoped OAuth integration → repository content/site.json + allowlisted assets/uploads/ → GitHub Pages.
GitHub Pages cannot execute server-side OAuth secret exchanges. Never embed a client secret, GitHub App private key, or personal access token in browser JavaScript.

## Proposed API contract (requires separately provisioned backend)
- GET /api/session: authenticated editor information only.
- GET /api/content: approved repository content and current blob SHA.
- PUT /api/content: schema-validated write to content/site.json with expected_sha for conflict protection and reviewable commit.
- POST /api/media: limited image/PDF uploads to assets/uploads only, enforce size/type/path allowlists.
- POST /api/logout: revoke session.

## Security requirements
- Authenticate with GitHub via a trusted server-side flow, using CSRF state and PKCE where applicable.
- Authorize only explicitly approved GitHub editor identity and repository permissions.
- Store short-lived credentials server-side; Secure + HttpOnly + SameSite session cookie; CSRF write protections.
- HTTPS-only, rate limiting, access audit, branch protections and commit/rollback plan.
- Validate JSON fields, URL schemes, asset formats and media size. Block scriptable uploads, arbitrary filenames and path traversal.
- Apply optimistic concurrency using GitHub blob SHA, protect against accidental overwrite.

## Rollout
1. Phase 1: branded interface with in-memory editing and JSON export; legacy Decap preserved.
2. Phase 2: deploy secure OAuth/backend under an authorized provider account.
3. Phase 3: add verified read/write and media upload, preview, publish review and audit.
4. Phase 4: regression testing on desktop/mobile, translations, rollback and handover.

## Until authenticated publishing exists
Export chen-site.json for backup. A reviewed update to content/site.json can be made through authenticated GitHub website or existing Decap setup if available. Exporting a file does NOT publish it.

## Existing data schema
about, profile, works, gallery, contact. Preserve existing keys to avoid breaking frontend rendering.
Any future custom domain migration must also update canonical, sitemap, and Search Console property after domain activation.