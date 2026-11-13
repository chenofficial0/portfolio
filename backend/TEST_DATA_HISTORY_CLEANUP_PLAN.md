# CHEN. — Test-data history cleanup preflight

Status: PREPARATION ONLY. History rewrite, force pushes, branch deletion, and production publishing have **not** been authorized by this checklist.

## Verified current state (2026-11-13)

- Five branches: `main`, `feature/secure-content-studio-api`, `feature/studio-safe-publish`, `feature/studio-hero-photo-upload`, and `feature/chen-content-studio-foundation`.
- Eleven unreferenced test-image paths (6 hero, 3 gallery, 2 work covers) were removed from the current `feature/secure-content-studio-api` tree and all eleven current-path lookups were confirmed absent.
- All eleven paths remained readable via an older Git commit during the history-retention test. Six unique image blob hashes existed among these eleven filenames.
- The current draft still references one hero portrait and one profile portrait, and both files are presently in the publicly accessible development branch; treat these as public until moved to private staging.
- Other branch tips did not show the eleven retired paths. `feature/studio-safe-publish` still references one **currently used** hero image through a legacy field: reconcile before publishing.
- `ENABLE_LIVE_PUBLISH = "false"` remains the intended setting. This checklist is not permission to turn it on.

## Required decisions / safeguards before a rewrite

1. Take a verified offline backup of the CURRENT project code and approved content. Keep this separate from any publicly accessible repo. Backups may contain test data and therefore require controlled access.
2. Inventory **all** Git refs, tags, pull-request references, forks, workflows and remote Pages deployment settings, not only the five branch tips. Check both images and historical JSON snapshots for unwanted content.
3. Decide whether the two currently referenced staged portraits are genuinely approved for public distribution. If not, move them out of publicly readable Git branches and update the preview storage mechanism first.
4. Establish a clean migration target including the verified `main` site, current Content Studio, backend Worker source, and approved content. Ensure Pages and Cloudflare integration remain functional; keep release publishing disabled.
5. Run `git-filter-repo` only in a local, disposable mirror or fresh clone and **review the resulting changed refs and affected PRs** before any remote push. For removing unneeded files, target exact paths across refs; scrub historical JSON field contents separately if necessary. Test the rewritten copy with a diff and functional checks.
6. Because force-pushing rewritten refs is destructive and may invalidate commit references, coordinate affected deployment hooks and collaborators; obtain explicit go-ahead before the remote rewrite.
7. Verify old paths at branch tips; then separately test GitHub historical commit access and public CDNs. De-referencing refs does not itself guarantee removal of GitHub cached views, forks, external clones or search caches.
8. GitHub Support's special sensitive-data removal process is limited; ordinary test photos do not automatically qualify for server-side cached-data purging. Record any unremovable copies as residual risk.
9. For future staging, do not commit unpublished files to public development branches. Use authenticated private storage; enforce expired URL access and clear deletion semantics in Studio.

## Release gate

Do not mark privacy cleanup COMPLETE until the rewritten target is reviewed, production deployment validated, and public old-file access checked. Do not attempt live publishing as part of a history-cleanup exercise.

Official background: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
