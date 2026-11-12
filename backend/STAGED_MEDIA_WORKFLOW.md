# CHEN. Content Studio: staged photo upload and draft workflow

This deployment is a **staging-only** implementation. It is not the final publishing feature.

## Runtime flags

- `ENABLE_MEDIA_UPLOADS = "true"`: logged-in, repository-authorized editors may explicitly upload JPEGs to `feature/secure-content-studio-api`.
- `ENABLE_DRAFT_SAVES = "true"`: editors can explicitly save modified site JSON to `content/site.json` on that same development branch.
- `ENABLE_CONTENT_WRITES = "false"`: live site publishing remains disabled.
- The Cloudflare Worker and existing public Pages site are separate; a staging GitHub commit does not publish to GitHub Pages main.

## User flow

1. Sign in to the Cloudflare-hosted `/studio` with the approved GitHub account.
2. Open ABOUT / PROFILE / FILMOGRAPHY / GALLERY, select a JPG, PNG or WebP photo (max 10 MB).
3. Browser downsizes images (max 2000 px longest side), re-encodes JPEG, then previews it locally.
4. Click **上傳照片** and confirm the public GitHub staging upload. The Worker checks session, account, CSRF, origin, scope, file size and JPEG start/end markers.
5. The editor receives the eventual GitHub Pages URL and can see the staged image when reloading through the authenticated `/api/media/preview` endpoint.
6. Click **儲存草稿** to save JSON to the development branch. Reload and check the image reference is preserved.
7. The public Pages site is **not** updated. File content stored in a *public GitHub repository*, including staging branches, must be treated as publicly accessible.

## Limitations and release requirements

- Up to 1.5 MiB processed JPEG per image. No SVG, animated formats or arbitrary file paths.
- Only staging content is editable; live publishing needs its own gated, atomic workflow for promoting both images and content to main.
- Image validation is basic file-format signature verification plus browser re-encoding, not full server-side image transcoding. Only approved GitHub owners can upload.
- Do not use actual confidential images for testing. Verify security controls and behavior on desktop/mobile.
- The upload call alone does NOT save the associated JSON reference. The separate draft-save action is required.
- Use GitHub commit history to undo staging edits. Review media retention/deletion before final release.

## Quick acceptance checks

- Logged-out `POST /api/media/image` returns 401.
- Authenticated invalid scope / invalid JPEG / wrong MIME / oversize file returns 422 or 413.
- Wrong origin or CSRF header returns 403.
- Editor selecting photo without uploading does not modify GitHub.
- Uploaded staged photo can be previewed after refresh once its URL is saved as a draft.
- The GitHub `main` branch and public website remain unchanged throughout.
