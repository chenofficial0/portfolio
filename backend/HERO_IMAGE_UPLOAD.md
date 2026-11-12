# CHEN. Hero image upload — staged implementation

## Available now
- The live Content Studio UI supports selecting JPG/PNG/WebP and previewing a **local** image in the ABOUT page.
- Browser downscales to a maximum 2000 px side and exports a JPEG at quality 0.82, stripping source metadata as part of re-encoding.
- File selection is restricted to images under 10 MB; generated JPEG is capped at 1.5 MiB.
- **No upload occurs** while the server reports canUpload=false. The preview is browser-memory-only and disappears on refresh.
- Existing URL field remains available until authenticated upload and media publishing have been verified.

## Backend (feature branch only)
- POST /api/media/hero requires authenticated approved GitHub editor, same-origin request, CSRF header, and separate ENABLE_MEDIA_UPLOADS=true flag.
- Accepts only a fixed filename (hero.jpg), MIME (image/jpeg), 1.5 MiB maximum, and validates start/end JPEG bytes. No arbitrary paths.
- Creates an unpredictable filename under assets/uploads on CONTENT_BRANCH (currently feature/secure-content-studio-api).
- Returns candidate public Pages URL and commit metadata. This URL will not resolve on public GitHub Pages until the image file is separately promoted into main; do not treat the staging upload as live publication.
- ENABLE_MEDIA_UPLOADS defaults to false. Never turn it on until tests and deployment review are complete.

## Required before live release
1. Verify feature-branch Worker endpoint and CSRF rejection, missing session rejection, over-limit image rejection, malformed base64 rejection, and image signature checks.
2. Add pixel-dimension and deeper content validation on server or verify client-only file handling is acceptable for owner-only upload.
3. Explicitly define media promotion to main, and atomically update content/site.json with conflict checks. A GitHub staging commit alone does not update the live website.
4. Test real mobile/desktop selection, blank image, orientation, compression, and performance.
5. Document backup, replace, removal, and rollback; avoid publishing confidential images accidentally.
6. Only enable upload on reviewed backend branch after end-to-end tests. Do not enable ENABLE_CONTENT_WRITES to main without a separate authorization and release decision.
