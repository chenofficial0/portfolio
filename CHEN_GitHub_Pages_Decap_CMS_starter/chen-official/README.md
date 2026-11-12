# CHEN. — Actor Official Website

**Architecture:** GitHub Pages + Eleventy 3 + Decap CMS. Public site stays clean, with a separate `/admin/` editor.

## Status

- Public website, CMS collections, deploy workflow: **implemented as a starter**.
- Working CMS sign-in: **NOT yet configured**. Requires GitHub repo + external OAuth service.
- Custom domain `chenofficial.com`: **planned only**, registration/ownership and DNS not checked or configured.
- Actual portrait, filmography, business email, PDFs: **not provided**, intentionally omitted.
- Original V1.0 source was **not present in the environment**, so this is a clean implementation from the agreed visual/functional specifications, not a byte-for-byte revision.

## Run locally

Prerequisites: Node.js 22 and npm. The GitHub build installs Eleventy from npm.

```bash
npm install
npm run dev
```

Open http://localhost:8080/ for the public website.

**Try local CMS (optional):** In a second terminal, run `npx decap-server`, then visit http://localhost:8080/admin/. `local_backend: true` allows local testing only; it is NOT an authentication solution for the deployed site.

## Deploy on GitHub Pages

1. Create a GitHub repository, e.g. `chen-official`, and push these project files to `main`.
2. In `static/admin/config.yml`, replace `YOUR_GITHUB_USERNAME/chen-official` with the actual `owner/repo`.
3. In GitHub repository **Settings → Pages → Build and deployment**, choose **GitHub Actions**. Push `main`; the workflow will build and deploy `_site`.
4. Your site will be available on the GitHub Pages URL. The root-relative URLs (`/css/...`, `/admin/...`) are intended for the **custom root domain**; until the custom domain is connected, use the Pages repo URL only to verify build status, not as the finished presentation URL. If you need working previews on a `username.github.io/repo` subpath before DNS, adjust your project's path prefix first.
5. Register/confirm ownership of `chenofficial.com`. Add the custom domain in GitHub Pages settings and configure DNS per GitHub docs; enable **Enforce HTTPS** once available.
6. Configure GitHub OAuth. GitHub Pages cannot run the required OAuth server: use a maintained hosted solution or deploy a secure external proxy/worker. Create a GitHub OAuth app as directed by that service and add `backend.base_url` / `backend.auth_endpoint` to `static/admin/config.yml`. Never commit secrets or OAuth client secrets to the repository.
7. Give only trusted GitHub accounts repository **write** access. Enable MFA and least-privilege permissions. The `/admin/` URL is public; it is the API's authorization, not hidden URLs, that controls editing.

## Updating content

- **Works:** add from CMS, or edit JSON files in `content/works/`. Each entry uses fields `title`, `title_en`, `title_ko`, `year`, `production`, `role_zh`, `role_en`, `role_ko`, `category`, `cover`, `stills` (array of `{image, caption}`), `video_url`, `video_label`, `sort_order`, `featured`, `visible`.
- **About:** `content/about.json` (show/hide birth year, names, translations, hero image).
- **PDF:** upload from CMS to `/assets/documents/` and update `content/profile.json`. PDF preview uses native iframe with an external open fallback for mobile readers.
- **Gallery:** `content/gallery.json`.
- **Contact:** `content/contact.json`.
- **Site metadata:** `content/settings.json`.

Decap CMS's editorial workflow saves drafts on Git branches/PRs; publishing merges changes to `main`, triggering the deployment. Use the editorial workflow UI to publish; an ordinary commit to `main` will deploy immediately.

## Media and privacy

All committed data and files deployed to GitHub Pages should be treated as publicly accessible. Do not upload personal/private documents. Before uploading work images or linking video ensure you have permission to publicly show them. Avoid very large PDF/media files in Git; consider external hosting for heavy video.

## Current limitations / future improvements

- Three-language UI covers basic interface and editable biography/title/role. Some static labels, galleries, and metadata remain language-neutral; a later pass can fully localize them.
- The minimal filmography card opens a detail modal; individual SEO pages are a future enhancement.
- `featured` field is retained for future homepage curation; currently all visible works appear in Filmography.
- PDF preview varies by browser; an 'Open PDF' fallback is present.
- Nothing here registers the domain, creates the GitHub repo or enables live CMS login on your behalf.

## Official docs

- https://www.11ty.dev/docs/
- https://decapcms.org/docs/github-backend/
- https://decapcms.org/docs/editorial-workflows/
- https://docs.github.com/en/pages
