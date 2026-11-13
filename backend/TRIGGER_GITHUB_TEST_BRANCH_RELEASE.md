# CHEN. Controlled GitHub Publication Rehearsal

User authorized continuing automated tests toward production release.
This trigger authorizes **only** creating branch
`test/chen-release-rehearsal-20261113` from the current `main` commit,
publishing the previously verified two-photo draft within that test branch,
then restoring its original tree via a new test-branch commit.

- No changes to GitHub `main`.
- No Cloudflare Worker deployment or KV changes.
- No removal of original photos.
- Refuse to reuse an existing test branch.
- Date: 2026-11-13.
