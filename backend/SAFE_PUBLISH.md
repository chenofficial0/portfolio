# CHEN. Content Studio — draft preview and reviewed publication

## Phase status

This release adds authenticated preview and a two-step publication implementation. The **public publishing switch remains OFF** (`ENABLE_LIVE_PUBLISH = "false"`). The current public website and `main` branch are not modified by preview or review.

## Routes

- `GET /preview`: only for a valid, signed-in editor; serves current public website layout with `content/site.json` request replaced by authenticated draft JSON.
- `GET /api/preview-content`: returns the current staging draft, rewriting staged image URLs to the authenticated image preview route.
- `GET /api/publish/plan`: authenticated comparison of staging JSON against live JSON. Verifies allowed staged image paths exist on the staging branch. Creates a short-lived (10 minute) review token.
- `POST /api/publish/confirm`: **disabled unless explicitly enabled via server variable**. Requires same-origin, CSRF, approved user, review token, literal confirmation PUBLISH, matching current staging/main branch heads, valid draft and same media set.

## Publish mechanics (only after future approval)

1. Review main HEAD and staging HEAD, as well as draft blob SHA and referenced photos.
2. Construct a Git tree based on main with `content/site.json` and only allowlisted referenced uploaded JPEG blobs.
3. Create one Git commit with parent main HEAD.
4. Advance `refs/heads/main` only as a fast-forward; fail safely if another commit has changed main.
5. GitHub Pages eventually deploys from main.

Only `assets/uploads/chen-{hero|profile|gallery|work-cover|work-still}-YYYY-MM-DD-{16-character-token}.jpg` can be copied from staging by this workflow. Photos are publicly visible in the GitHub repository even before official site publication.

## Security / release checklist

- Verify GitHub OAuth and cookie restrictions, CSRF rejection, account allowlist and scope.
- Verify preview never indexes in search (noindex, nofollow), no unauthenticated access, no cache.
- Verify draft preview matches actual website layout and photo preview works.
- Review all URLs, personal details and image publication rights before enabling release.
- Confirm invalid/expired review token, bad confirmation, wrong origin, stale staging or live SHA all reject.
- Check GitHub branch protection and permissions, rollback procedure and post-commit GitHub Pages deployment.
- **Explicit owner approval is required before enabling `ENABLE_LIVE_PUBLISH=true`.**
- Do not treat this code as production-verified until browser/API integration testing is completed.

## User interface

While publication remains locked, the logged-in editor can open **預覽網站** and **正式發布檢查** to see what would change. Final confirmation button appears only if the server explicitly authorizes it. Changes only in the local browser must first be saved to GitHub staging via **儲存草稿**.
