# CHEN Cloudflare KV Read-Only Audit Trigger

This file is an explicit opt-in for the no-deployment GitHub Actions workflow:
`.github/workflows/cloudflare-kv-readonly-audit.yml`.

- Expected namespace: `CHEN_PRIVATE_DRAFTS`
- Expected binding: `PRIVATE_DRAFT_KV`
- Authorized inputs: repository Secrets configured directly by owner
- Permitted actions: Cloudflare API GET only; no writes, no deploys
- Trigger date: 2026-11-13
- Never include token values or key contents in this file
