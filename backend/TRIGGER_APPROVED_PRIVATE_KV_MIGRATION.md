# CHEN private KV copy — explicitly authorized

Owner confirmed that the scoped Cloudflare KV migration token has been installed
as the GitHub Secret `CLOUDFLARE_KV_MIGRATION_TOKEN` on 2026-11-13.

The triggered job `controlled-private-kv-migration.yml` is restricted to:
- checking source snapshot Git hashes and both original images
- checking that dedicated KV namespace appears empty
- writing exactly two private media keys and one brand-new immutable root revision
- verifying each stored value with a read-back comparison
- no deletes, no original Git edits, no deployments, no publishing

If interrupted or uncertain, stop. Never rerun blindly against a partially populated namespace.
