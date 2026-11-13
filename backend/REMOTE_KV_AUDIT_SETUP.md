# CHEN. Cloudflare KV — remote read-only verification setup

## Status and safety
This is a **manual Cloudflare credential connection step**. The GitHub workflow
`.github/workflows/cloudflare-kv-readonly-audit.yml` has no deploy,
write, delete, publish, or migration commands.

The workflow only runs on a deliberately edited feature-branch trigger file
`backend/TRIGGER_CLOUDFLARE_KV_READONLY_AUDIT.md`. Its initial creation is
reserved for the project maintainer after secrets have been installed. Do not
merge this experimental workflow to `main` before release review.

## Two GitHub Actions secrets required
In `chenofficial0/portfolio` -> **Settings -> Secrets and variables ->
Actions -> New repository secret**:

- `CLOUDFLARE_ACCOUNT_ID`: account ID from Cloudflare (32 hexadecimal characters).
- `CLOUDFLARE_KV_READ_TOKEN`: a Cloudflare **API token** scoped to this account
  with only **Workers KV Storage: Read** permission. Do not grant KV Write,
  Workers Scripts Write, edit/deploy, or account administration.

**NEVER paste the API token into ChatGPT, a public issue, a commit, or a log.**
If the user accidentally shares it, revoke and replace it.

## Verification
After the user has entered both secrets directly in GitHub, they can tell the
assistant "GitHub Secrets 設定完成" without showing secret values.
The assistant can then create/update the trigger file, causing a read-only
audit. Logs reveal only identity check and whether inventory appears empty,
never key names or values.

## Known limitations
A read-only REST API verification proves that the token can access the named
Cloudflare namespace and list its keys. It does not prove authenticated
Worker bindings can perform writes, and does not provide an atomic lock over KV.
The current Studio editor still uses the legacy GitHub draft save API. It must
be integrated and verified before the private draft mode is enabled.
No production Worker deployment or photo migration has been performed.
