# Phase 19 — explicitly authorized production read-only verification

Run the independent checks for deployed Worker v85, public page/favicon, and
anonymous protection of private drafts, previews, media and release plans.

This workflow issues GET only, reads Worker version metadata (not secret values),
does not authenticate as the owner and never writes Cloudflare KV, GitHub main,
production Workers or public website content.

2026-11-13.
