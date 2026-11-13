# Phase 20 read-only live acceptance trigger

Confirm production Worker is version 6bdc091b-08a8-44d6-a418-4d94e5eb25a7
with authenticated private Studio preview/listing only. All draft/media writes,
GitHub public publishing and rollback must remain disabled. Validate anonymously
that /studio redirects to GitHub login and /studio/private denies direct access.

Run only read-only Cloudflare GETs and public anonymous GETs; no mutations.
2026-11-13.
