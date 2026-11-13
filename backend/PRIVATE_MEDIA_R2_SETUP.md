# CHEN. — Private pre-publication media staging (R2)

**Status: code staged on feature branch; NOT deployed.** Production deployment and migration require owner review. Keep `ENABLE_LIVE_PUBLISH = "false"`.

## Security behavior

- New JPEG photos and supported PDF/JPG/PNG documents are stored in a Cloudflare R2 bucket, **not** committed to the public GitHub development branch.
- The bucket must have **no public development URL or custom public domain**, and must be bound to the Worker as `PRIVATE_MEDIA`.
- No R2 binding => uploads return HTTP 503. There is deliberately **no GitHub fallback**.
- The Content Studio draft stores opaque `private-media/chen-…` references, not publicly accessible file URLs.
- Authenticated Worker `/api/media/preview?path=…` serves the objects with `no-store` and strict media verification. Non-authenticated users must receive HTTP 401.
- On an approved future release only, the Worker uploads referenced R2 bytes into GitHub blobs and rewrites the **published** JSON file to public GitHub Pages image paths. The draft retains private references.
- Previously uploaded GitHub images **remain public in existing commits** until independently migrated and history cleaned. This change does not undo historical exposure.

## Cloudflare configuration: manual provisioning required

1. In Cloudflare Dashboard open **R2 Object Storage** and create a new bucket (suggested name `chen-studio-private-media`).
2. Do **not** enable public bucket access, `r2.dev` public delivery or custom-domain routing. Confirm public access is disabled.
3. In **Workers & Pages → chen-content-studio-api → Settings → Bindings** add an **R2 bucket** binding:
   - Variable/binding name: `PRIVATE_MEDIA`
   - Bucket: the newly created private bucket.
4. If deploying with Wrangler, after the bucket exists add to `backend/wrangler.toml`:

   ```toml
   [[r2_buckets]]
   binding = "PRIVATE_MEDIA"
   bucket_name = "chen-studio-private-media"
   ```

   Use the **actual** bucket name if different; do not deploy a guessed binding. See Cloudflare documentation: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
5. Deploy the reviewed Worker code from `feature/secure-content-studio-api`, then deploy the updated Content Studio HTML separately. **Do not deploy the new Studio HTML before the new Worker API**.
6. Run a test under the authorized GitHub login with one harmless file. Verify that the new draft reference begins `private-media/`, the preview requires login, and no new GitHub upload commit was created.
7. Verify the existing two staged GitHub photos still preview via legacy API. Leave them in place until the replacement and history-cleanup process has been approved.
8. Confirm the formal publish control remains unavailable. The release code path needs a separate end-to-end dry run against mock GitHub/R2 APIs, and a later explicit release authorization.

## Outstanding improvements / risks

- R2 orphan cleanup and file lifecycle management are still required. Deleting a draft reference currently does **not** remove a private R2 object; do not claim permanent deletion.
- Public GitHub draft JSON still exposes ordinary draft text (and opaque R2 object identifiers). Full draft privacy requires moving the JSON draft out of the public branch as a separate project.
- R2 objects must have a documented retention, deletion, backup and audit policy.
- A previous GitHub deployment may continue using the original public-upload flow until the new Worker has been safely deployed; while migrating, disable production media uploads in Cloudflare (`ENABLE_MEDIA_UPLOADS = false`) to prevent further public commits.
