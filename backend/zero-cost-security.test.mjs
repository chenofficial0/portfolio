// Zero-cost migration regression tests (isolated branch; no live API calls).
// Run with: node backend/zero-cost-security.test.mjs
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import worker from "./src/worker.js";

const crypto = globalThis.crypto ?? webcrypto;
const origin = "https://studio-zero-cost.invalid";
const store = new Map();
const env = {
  PUBLIC_API_ORIGIN: origin,
  GITHUB_CLIENT_ID: "test-only",
  ENABLE_DRAFT_SAVES: "true",
  ENABLE_CONTENT_WRITES: "false",
  ENABLE_LIVE_PUBLISH: "false",
  ENABLE_MEDIA_UPLOADS: "false",
  STUDIO_KV: {
    get: async key => store.get(key) ?? null,
    put: async (key, value) => { store.set(key, value); },
    delete: async key => { store.delete(key); }
  }
};
const keyBytes = crypto.getRandomValues(new Uint8Array(32));
env.SESSION_ENCRYPTION_KEY = Buffer.from(keyBytes).toString("base64");
const iv = crypto.getRandomValues(new Uint8Array(12));
const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
const editorSession = {
  login: "chenofficial0", csrf: "test-csrf-only",
  token: "DUMMY_NOT_A_REAL_TOKEN", exp: Date.now() + 60000
};
const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key,
  new TextEncoder().encode(JSON.stringify(editorSession)));
const sid = "test-session-only";
const hash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sid))).toString("base64url");
store.set("session:" + hash, Buffer.from(iv).toString("base64") + "." + Buffer.from(encrypted).toString("base64"));

async function request(path, method = "GET", headers = {}, body) {
  return worker.fetch(new Request(origin + path, {
    method,
    headers: { cookie: "chen_session=" + sid, ...headers },
    ...(body === undefined ? {} : { body })
  }), env);
}
const sameOrigin = { origin };

assert.equal((await request("/api/session")).status, 200);
const active = await (await request("/api/session")).json();
assert.equal(active.authenticated, true);
assert.equal(active.canPublish, false);
assert.equal(active.canSave, true);
assert.equal(active.canUpload, false);
assert.equal("token" in active, false);

const wrongOrigin = await request("/api/content", "PUT", { origin: "https://untrusted.invalid" }, "{}");
assert.equal(wrongOrigin.status, 403);
const noCsrf = await request("/api/content", "PUT", sameOrigin, "{}");
assert.equal(noCsrf.status, 403);
assert.match((await noCsrf.json()).error, /CSRF/i);

const noPublish = await request("/api/publish/confirm", "POST",
  { ...sameOrigin, "x-chen-csrf": "test-csrf-only" }, "{}");
assert.equal(noPublish.status, 403);
assert.match((await noPublish.json()).error, /not been approved|not enabled/i);

const noUpload = await request("/api/media/image", "POST",
  { ...sameOrigin, "x-chen-csrf": "test-csrf-only" }, "{}");
assert.equal(noUpload.status, 403);
assert.match((await noUpload.json()).error, /disabled/i);

assert.equal((await worker.fetch(new Request(origin + "/api/content"), env)).status, 401);
assert.equal((await worker.fetch(new Request(origin + "/api/preview-content"), env)).status, 401);
assert.equal((await worker.fetch(new Request(origin + "/api/media/preview"), env)).status, 401);

// Newly added KV uploads are disabled by default, even with an authenticated session.
const deniedPrivateUpload = await request("/api/media/private", "POST",
  {origin, "x-chen-csrf":"test-csrf-only", "content-type":"application/json"}, "{}");
assert.equal(deniedPrivateUpload.status, 403);
assert.match((await deniedPrivateUpload.json()).error, /disabled/i);

// Deletion always fails closed until a separate opt-in flag is reviewed.
const deniedDelete = await request("/api/media/private", "DELETE",
  { origin, "x-chen-csrf": "test-csrf-only", "content-type": "application/json" },
  JSON.stringify({path:"private-kv/chen-hero-2026-11-13-abcdefghijklmnop.jpg",confirmation:"DELETE_PRIVATE_MEDIA"}));
assert.equal(deniedDelete.status, 403);
assert.match((await deniedDelete.json()).error, /disabled/i);
assert.equal((await request("/api/media/private", "DELETE", {origin:"https://untrusted.invalid"}, "{}")).status,403);

// Private KV media preview is read-only and authenticated; no public GitHub call.
const image = new Uint8Array(100).fill(1);
image.set([255, 216], 0); image.set([255, 217], 98);
const privatePath = "private-kv/chen-hero-2026-11-13-abcdefghijklmnop.jpg";
env.PRIVATE_DRAFT_KV = {
  get: async (key, format) => key === privatePath && format === "arrayBuffer" ? image.slice().buffer : null,
  put: async () => { throw Error("Read-only test must not write"); },
  delete: async () => { throw Error("Read-only test must not delete"); }
};
const previewUrl = "/api/media/preview?path=" + encodeURIComponent(privatePath);
const preview = await request(previewUrl);
assert.equal(preview.status, 200);
assert.equal(preview.headers.get("cache-control"), "private, no-store");
assert.equal(preview.headers.get("content-type"), "image/jpeg");
assert.deepEqual(new Uint8Array(await preview.arrayBuffer()), image);
assert.equal((await worker.fetch(new Request(origin + previewUrl), env)).status, 401);
assert.equal((await request("/api/media/preview?path=private-kv%2F..%2Fbad")).status, 400);
delete env.PRIVATE_DRAFT_KV;
assert.equal((await request(previewUrl)).status, 404);

// Opted-in private draft mode must NEVER fall back to public GitHub on missing storage.
env.ENABLE_PRIVATE_DRAFTS = "true";
assert.equal((await (await request("/api/session")).json()).canSave,false);
assert.equal((await request("/api/content")).status, 503);
assert.equal((await request("/api/preview-content")).status, 503);
assert.equal((await request("/api/publish/plan")).status, 403);
assert.equal((await request("/api/publish/confirm","POST",
  {origin, "x-chen-csrf":"test-csrf-only"},"{}")).status,403);
assert.equal((await request("/api/content","PUT",
  {origin,"x-chen-csrf":"test-csrf-only","content-type":"application/json"},"{}")).status,422);
delete env.ENABLE_PRIVATE_DRAFTS;
// Explicitly enabled only inside isolated tests: origin and CSRF still block writes.
env.ENABLE_IMMUTABLE_DRAFTS="true";
assert.equal((await (await request("/api/session")).json()).canSave,false);
assert.equal((await request("/api/content")).status,403);
assert.equal((await request("/api/content","PUT",
 {origin,"x-chen-csrf":"test-csrf-only","content-type":"application/json"},
 JSON.stringify({sha:"0123456789012345678901234567890123456789",
 data:{about:{},profile:{},contact:{},works:[],gallery:[]}}))).status,403);
assert.equal((await request("/api/preview-content")).status,403);
assert.equal((await request("/api/publish/plan")).status,403);
assert.equal((await request("/api/publish/confirm","POST",
 {origin,"x-chen-csrf":"test-csrf-only","content-type":"application/json"},
 JSON.stringify({planId:"review-plan",confirmation:"PUBLISH"}))).status,403);
assert.equal((await request("/api/draft/revision","POST",
  {origin,"content-type":"application/json"},
  JSON.stringify({parentId:null,data:{}}))).status,403);
assert.equal((await request("/api/draft/revision","POST",
  {origin:"https://untrusted.invalid","x-chen-csrf":"test-csrf-only"},
  JSON.stringify({parentId:null,data:{}}))).status,403);
assert.equal((await request("/api/draft/revision?id=bad")).status,400);
delete env.ENABLE_IMMUTABLE_DRAFTS;

// Authenticated append-only revisions preserve both concurrent device edits.
const revisionRecords=new Map();
env.PRIVATE_DRAFT_KV={
  get: async key=>revisionRecords.get(key)??null,
  put: async (key,value)=>{
    if(revisionRecords.has(key))throw Error("Immutable revision overwritten");
    revisionRecords.set(key,value);
  },
  delete:async()=>{throw Error("Revision deletion not allowed")},
  list:async ({prefix,limit,cursor})=>{
    const matches=[...revisionRecords.keys()].filter(key=>key.startsWith(prefix)).sort();
    const start=cursor?Number(cursor.slice(1)):0;
    return {keys:matches.slice(start,start+limit).map(name=>({name})),
      list_complete:start+limit>=matches.length,
      cursor:start+limit<matches.length?"p"+(start+limit):""};
  }
};
env.ENABLE_IMMUTABLE_DRAFTS="true";
const validDraft={about:{},profile:{},contact:{},works:[],gallery:[]};
const revisionHeaders={origin,"x-chen-csrf":"test-csrf-only","content-type":"application/json"};
const rootResult=await request("/api/draft/revision","POST",revisionHeaders,
  JSON.stringify({parentId:null,data:validDraft}));
assert.equal(rootResult.status,201);
const rootRevision=await rootResult.json();
assert.equal(rootRevision.immutable,true);
const revisionUrl=id=>"/api/draft/revision?id="+encodeURIComponent(id);
const parentRead=await request(revisionUrl(rootRevision.id));
assert.equal(parentRead.status,200);
assert.deepEqual((await parentRead.json()).data,validDraft);
const desktop={...validDraft,about:{name_zh:"Desktop version"}};
const mobile={...validDraft,about:{name_zh:"Mobile version"}};
const [desktopResponse,mobileResponse]=await Promise.all([
  request("/api/draft/revision","POST",revisionHeaders,JSON.stringify({parentId:rootRevision.id,data:desktop})),
  request("/api/draft/revision","POST",revisionHeaders,JSON.stringify({parentId:rootRevision.id,data:mobile}))
]);
assert.equal(desktopResponse.status,201);
assert.equal(mobileResponse.status,201);
const desktopId=(await desktopResponse.json()).id;
const mobileId=(await mobileResponse.json()).id;
assert.notEqual(desktopId,mobileId);
assert.deepEqual((await (await request(revisionUrl(desktopId))).json()).data,desktop);
assert.deepEqual((await (await request(revisionUrl(mobileId))).json()).data,mobile);
assert.deepEqual((await (await request(revisionUrl(rootRevision.id))).json()).data,validDraft);
assert.equal((await worker.fetch(new Request(origin+revisionUrl(rootRevision.id)),env)).status,401);
// Private full-site preview is explicitly gated and never offers an anonymous draft.
const privatePreviewPath="/api/preview/private-content?revision="+rootRevision.id;
assert.equal((await request(privatePreviewPath)).status,403);
env.ENABLE_PRIVATE_STUDIO="true";
const privatePreview=await request(privatePreviewPath);
assert.equal(privatePreview.status,200);
assert.deepEqual(await privatePreview.json(),validDraft);
assert.equal((await request("/api/preview/private-content?revision=bad")).status,400);
assert.equal((await worker.fetch(new Request(origin+privatePreviewPath),env)).status,401);
delete env.ENABLE_PRIVATE_STUDIO;
env.ENABLE_REVISION_COMPARISON="true";
// The private comparison UI is protected by the same login and feature flags.
const comparisonPage=await request("/studio/revisions");
assert.equal(comparisonPage.status,200);
assert.match(comparisonPage.headers.get("content-type"),/text\/html/);
assert.equal(comparisonPage.headers.get("cache-control"),"private, no-store");
assert.match(comparisonPage.headers.get("content-security-policy"),/script-src 'nonce-/);
const renderedPage=await comparisonPage.text();
assert.match(renderedPage,/草稿版本比較/);
assert.match(renderedPage,/api\/draft\/compare/);
assert.equal((await worker.fetch(new Request(origin+"/studio/revisions"),env)).status,401);
const listingResponse=await request("/api/draft/revisions");
assert.equal(listingResponse.status,200);
assert.equal(listingResponse.headers.get("cache-control"),"no-store");
const listing=await listingResponse.json();
assert.equal(listing.revisions.length,3);
assert.equal(listing.complete,true);
assert.equal(listing.revisions.find(x=>x.id===desktopId).parentId,rootRevision.id);
assert.equal("data" in listing.revisions[0],false);
assert.equal((await request("/api/draft/revisions?cursor=%2E%2E%2Fbad")).status,400);
assert.equal((await worker.fetch(new Request(origin+"/api/draft/revisions"),env)).status,401);
assert.match(renderedPage,/api\/draft\/revisions/);
const mediaDraft={...validDraft,
  about:{hero_images:[{image:"private-kv/chen-hero-2026-11-12-8tp6PGMB_zcRxazp.jpg"}]},
  profile:{photo:"private-kv/chen-profile-2026-11-12-mragG3nnw0NgdAUw.jpg"}};
const photoResult=await request("/api/draft/revision","POST",revisionHeaders,
  JSON.stringify({parentId:rootRevision.id,data:mediaDraft}));
assert.equal(photoResult.status,201);
const photoId=(await photoResult.json()).id;
env.ENABLE_PRIVATE_STUDIO="true";
const photoPreview=await request("/api/preview/private-content?revision="+photoId);
assert.equal(photoPreview.status,200);
const displayed=await photoPreview.json();
assert.equal(displayed.about.hero_images[0].image,
 "/api/media/preview?path="+encodeURIComponent(mediaDraft.about.hero_images[0].image));
assert.equal(displayed.profile.photo,
 "/api/media/preview?path="+encodeURIComponent(mediaDraft.profile.photo));
delete env.ENABLE_PRIVATE_STUDIO;

const comparePath="/api/draft/compare?base="+rootRevision.id+"&left="+desktopId+"&right="+mobileId;
const threeWayResponse=await request(comparePath);
assert.equal(threeWayResponse.status,200);
const diff=await threeWayResponse.json();
assert.equal(diff.hasConflicts,true);
assert.equal(diff.summary.conflict,1);
assert.equal(diff.changes[0].path,"/about/name_zh");
assert.equal(diff.automaticMergePerformed,false);
assert.equal((await request("/api/draft/compare?base=bad&left=bad&right=bad")).status,400);
assert.equal((await worker.fetch(new Request(origin+comparePath),env)).status,401);
assert.equal((await request("/api/draft/compare?base="+desktopId+"&left="+rootRevision.id+"&right="+mobileId)).status,409);
// Merge preview requires explicit decisions and must not modify stored revisions.
const mergeUrl="/api/draft/merge-preview";
const mergeBase={base:rootRevision.id,left:desktopId,right:mobileId,decisions:{}};
const postMerge=(payload,headers={origin,"x-chen-csrf":"test-csrf-only","content-type":"application/json"})=>
  request(mergeUrl,"POST",headers,JSON.stringify(payload));
assert.equal((await postMerge(mergeBase,{origin,"content-type":"application/json"})).status,403);
assert.equal((await postMerge(mergeBase,{origin:"https://untrusted.invalid","x-chen-csrf":"test-csrf-only"})).status,403);
assert.equal((await worker.fetch(new Request(origin+mergeUrl,{method:"POST",headers:{origin,"content-type":"application/json"},body:"{}"}),env)).status,401);
const incomplete=await postMerge(mergeBase);
assert.equal(incomplete.status,200);
const partial=await incomplete.json();
assert.equal(partial.ready,false);
assert.equal(partial.merged,null);
assert.deepEqual(partial.unresolved,["/about/name_zh"]);
const storedCount=revisionRecords.size;
const accepted=await postMerge({...mergeBase,decisions:{"/about/name_zh":"left"}});
assert.equal(accepted.status,200);
const merged=await accepted.json();
assert.equal(merged.ready,true);
assert.equal(merged.merged.about.name_zh,"Desktop version");
assert.equal(merged.persisted,false);
assert.equal(merged.published,false);
assert.equal(revisionRecords.size,storedCount);
assert.equal((await postMerge({...mergeBase,decisions:{"/about/name_zh":"base"}})).status,422);
assert.equal((await postMerge({...mergeBase,decisions:{"/bad/path":"left"}})).status,422);
assert.match(renderedPage,/api\/draft\/merge-preview/);
// Save is a separate explicit opt-in: compare capability does not permit storing merges.
const reviewedMerge={...mergeBase,decisions:{"/about/name_zh":"left"}};
const previewForSave=await postMerge(reviewedMerge);
assert.equal(previewForSave.status,200);
const previewHash=(await previewForSave.json()).previewDigest;
assert.match(previewHash,/^[a-f0-9]{64}$/);
const saveRequest=(body,headers={origin,"x-chen-csrf":"test-csrf-only","content-type":"application/json"})=>
  request("/api/draft/merge-save","POST",headers,JSON.stringify(body));
assert.equal((await saveRequest({...reviewedMerge,previewDigest:previewHash,
 confirmation:"SAVE_MERGE_AS_NEW_REVISION"})).status,403);
env.ENABLE_MERGE_SAVES="true";
assert.equal((await saveRequest({...reviewedMerge,previewDigest:previewHash,
 confirmation:"SAVE_MERGE_AS_NEW_REVISION"},{origin,"content-type":"application/json"})).status,403);
assert.equal((await saveRequest({...reviewedMerge,previewDigest:previewHash,
 confirmation:"SAVE_MERGE_AS_NEW_REVISION"},{origin:"https://not-allowed.invalid",
 "x-chen-csrf":"test-csrf-only","content-type":"application/json"})).status,403);
assert.equal((await saveRequest({...reviewedMerge,previewDigest:previewHash})).status,422);
assert.equal((await saveRequest({...reviewedMerge,previewDigest:"0".repeat(64),
 confirmation:"SAVE_MERGE_AS_NEW_REVISION"})).status,409);
const countBeforeSave=revisionRecords.size;
const saveResponse=await saveRequest({...reviewedMerge,previewDigest:previewHash,
 confirmation:"SAVE_MERGE_AS_NEW_REVISION"});
assert.equal(saveResponse.status,201);
const resultSave=await saveResponse.json();
assert.equal(resultSave.ok,true);
assert.equal(resultSave.published,false);
assert.equal(resultSave.originalRevisionsPreserved,true);
assert.equal(resultSave.revision.parentId,rootRevision.id);
assert.equal(revisionRecords.size,countBeforeSave+2);
const retryResponse=await saveRequest({...reviewedMerge,previewDigest:previewHash,
 confirmation:"SAVE_MERGE_AS_NEW_REVISION"});
assert.equal(retryResponse.status,201);
const retrySave=await retryResponse.json();
assert.equal(retrySave.alreadySaved,true);
assert.equal(retrySave.revision.id,resultSave.revision.id);
assert.equal(revisionRecords.size,countBeforeSave+2);
const storedMerge=(await (await request(revisionUrl(resultSave.revision.id))).json()).data;
assert.equal(storedMerge.about.name_zh,"Desktop version");
assert.deepEqual((await (await request(revisionUrl(rootRevision.id))).json()).data,validDraft);
assert.deepEqual((await (await request(revisionUrl(mobileId))).json()).data,mobile);
delete env.ENABLE_MERGE_SAVES;
delete env.ENABLE_REVISION_COMPARISON;
assert.equal((await request("/studio/revisions")).status,403);
assert.equal((await request(comparePath)).status,403);
assert.equal((await request("/api/draft/revisions")).status,403);
delete env.ENABLE_IMMUTABLE_DRAFTS;
delete env.PRIVATE_DRAFT_KV;

// Two-phase publication is unavailable until every independent release gate is enabled.
const deniedReview=await request("/api/publish/private-review","POST",
 {origin,"x-chen-csrf":"test-csrf-only","content-type":"application/json"},
 JSON.stringify({revisionId:"R".repeat(32),confirmation:"REVIEW_PRIVATE_PUBLICATION"}));
assert.equal(deniedReview.status,403);
const deniedConfirm=await request("/api/publish/private-confirm","POST",
 {origin,"x-chen-csrf":"test-csrf-only","content-type":"application/json"},
 JSON.stringify({reviewId:"x".repeat(43),confirmation:"PUBLISH_APPROVED_PRIVATE_REVISION"}));
assert.equal(deniedConfirm.status,403);
assert.equal((await request("/api/publish/private-confirm","POST",
 {origin:"https://evil.invalid","x-chen-csrf":"test-csrf-only"},"{}")).status,403);
assert.equal((await worker.fetch(new Request(origin+"/api/publish/private-review",{method:"POST",
 headers:{"origin":origin}}),env)).status,401);
// Private publication plans are read-only, separately gated, and never approval to publish.
assert.equal((await request("/api/publish/private-plan?revision="+("R".repeat(32)))).status,403);
assert.equal((await worker.fetch(new Request(origin+"/api/publish/private-plan?revision="+("R".repeat(32))),env)).status,401);
env.ENABLE_PRIVATE_PUBLISH_PLANS="true";
assert.equal((await request("/api/publish/private-plan?revision="+("R".repeat(32)))).status,403);
env.ENABLE_PRIVATE_STUDIO="true";
env.ENABLE_IMMUTABLE_DRAFTS="true";
assert.equal((await request("/api/publish/private-plan?revision=not-a-revision")).status,400);
delete env.ENABLE_PRIVATE_PUBLISH_PLANS;
delete env.ENABLE_PRIVATE_STUDIO;
delete env.ENABLE_IMMUTABLE_DRAFTS;
// Private editor must not be reachable before release flags, and never anonymously.
assert.equal((await request("/studio/private")).status,403);
assert.equal((await (await request("/api/session")).json()).canUseImmutableStudio,false);
env.ENABLE_PRIVATE_STUDIO="true";
assert.equal((await request("/studio/private")).status,403);
env.ENABLE_IMMUTABLE_DRAFTS="true";
assert.equal((await request("/studio/private")).status,403);
env.ENABLE_REVISION_COMPARISON="true";
assert.equal((await (await request("/api/session")).json()).canUseImmutableStudio,true);
const studioRedirect=await request("/studio");
assert.equal(studioRedirect.status,302);
assert.equal(studioRedirect.headers.get("location"),origin+"/studio/private");
const anonRedirect=await worker.fetch(new Request(origin+"/studio"),env);
assert.equal(anonRedirect.status,302);
assert.equal(anonRedirect.headers.get("location"),origin+"/auth/login");
assert.equal((await worker.fetch(new Request(origin+"/studio/private"),env)).status,401);
delete env.ENABLE_PRIVATE_STUDIO;
delete env.ENABLE_IMMUTABLE_DRAFTS;
delete env.ENABLE_REVISION_COMPARISON;
// The live-bound KV namespace never receives migration writes from a diagnostic route.
assert.equal((await request("/api/migration/readiness")).status,403);
assert.equal((await worker.fetch(new Request(origin+"/api/migration/readiness"),env)).status,401);
let auditedReads=0,diagnosticWrites=0;
env.PRIVATE_DRAFT_KV={
  get:async()=>{auditedReads++;return null},
  list:async()=>{auditedReads++;return {keys:[],list_complete:true}},
  put:async()=>{diagnosticWrites++;throw Error("Readiness must never write")},
  delete:async()=>{diagnosticWrites++;throw Error("Readiness must never delete")}
};
env.ENABLE_MIGRATION_AUDIT="true";
const ready=await request("/api/migration/readiness");
assert.equal(ready.status,200);
assert.equal((await ready.json()).ready,true);
assert.ok(auditedReads>0);
assert.equal(diagnosticWrites,0);
env.PRIVATE_DRAFT_KV.list=async()=>({keys:[{name:"already-present"}],list_complete:true});
const occupied=await request("/api/migration/readiness");
assert.equal(occupied.status,200);
assert.equal((await occupied.json()).ready,false);
env.PRIVATE_DRAFT_KV.list=async()=>({keys:[],list_complete:false,cursor:"next"});
assert.equal((await request("/api/migration/readiness")).status,503);
assert.equal(diagnosticWrites,0);
delete env.ENABLE_MIGRATION_AUDIT;
delete env.PRIVATE_DRAFT_KV;

// Immutable history has its own disabled-by-default gate.
assert.equal((await request("/api/draft/revision?id=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).status,403);
assert.equal((await request("/api/draft/revision","POST",
  {origin,"x-chen-csrf":"test-csrf-only","content-type":"application/json"},
  JSON.stringify({parentId:null,data:{}}))).status,403);
assert.equal((await worker.fetch(new Request(origin+"/api/draft/revision?id=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),env)).status,401);
console.log("PASS: session flags, editor auth, wrong origin, missing CSRF, live publish disabled, media uploads disabled, anonymous reads denied.");
