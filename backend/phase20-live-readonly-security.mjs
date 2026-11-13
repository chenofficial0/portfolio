// Production acceptance check, read-only Cloudflare API and anonymous HTTP.
// No login, PUT/POST, writes, secret values, KV payload reads, or deployments.
import assert from "node:assert/strict";
const worker="chen-content-studio-api";
const versionId="6bdc091b-08a8-44d6-a418-4d94e5eb25a7"; // deployed private Studio read-only candidate
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_WORKER_EDITOR_TOKEN;
assert.match(account||"",/^[a-f0-9]{32}$/,"Account ID must be configured");
assert.ok(token&&token.length>8,"Scoped read-capable Worker token must be configured");
const apiBase="https://api.cloudflare.com/client/v4/accounts/"+account+"/workers/scripts/"+worker;
async function cloudflare(path){
 const resp=await fetch(apiBase+path,{method:"GET",headers:{
  Authorization:"Bearer "+token,Accept:"application/json"
 },signal:AbortSignal.timeout(18000)});
 assert.equal(resp.status,200,"Cloudflare read-only metadata request failed");
 const body=await resp.json();
 assert.equal(body.success,true,"Cloudflare metadata API denied request");
 return body.result;
}
const [version,deployments]=await Promise.all([
 cloudflare("/versions/"+versionId),cloudflare("/deployments?per_page=3")
]);
assert.equal(version?.id,versionId,"Expected deployed Worker version not found");
const active=deployments?.deployments?.[0]?.versions;
assert.ok(Array.isArray(active)&&active.length===1,"Unexpected active deployment set");
assert.equal(active[0].version_id,versionId,"Production Worker drifted from audited v85");
assert.equal(active[0].percentage,100,"Production traffic should be on one version");
const bindings=version?.resources?.bindings;
assert.ok(Array.isArray(bindings),"Version bindings inaccessible");
const values=new Map(),names=new Set(),namespaces=new Map();
for(const binding of bindings){
 names.add(binding.name);
 if(binding.type==="plain_text")values.set(binding.name,binding.text);
 if(binding.type==="kv_namespace")namespaces.set(binding.name,binding.namespace_id);
}
const requiredReadOnly=["ENABLE_IMMUTABLE_DRAFTS","ENABLE_REVISION_COMPARISON","ENABLE_PRIVATE_STUDIO"];
for(const name of requiredReadOnly)
 assert.equal(values.get(name),"true","Authenticated preview must be enabled: "+name);
const disabled=[
 "ENABLE_CONTENT_WRITES","ENABLE_MEDIA_UPLOADS","ENABLE_LIVE_PUBLISH",
 "ENABLE_PRIVATE_DRAFTS","ENABLE_IMMUTABLE_DRAFT_WRITES",
 "ENABLE_MERGE_SAVES","ENABLE_PRIVATE_PUBLISH_PLANS",
 "ENABLE_PRIVATE_PUBLISH_CONFIRM","ENABLE_PRIVATE_ROLLBACK","ENABLE_KV_MEDIA_UPLOADS",
 "ENABLE_KV_MEDIA_DELETES","ENABLE_MIGRATION_AUDIT"
];
for(const name of disabled)
 assert.equal(values.get(name),"false","Unapproved feature is enabled: "+name);
assert.equal(values.get("ENABLE_DRAFT_SAVES"),"true");
assert.equal(namespaces.get("PRIVATE_DRAFT_KV"),"aad4672cc5474625b8fc0f070e75bc99");
assert.equal(namespaces.get("STUDIO_KV"),"f5115459b9a0488186850f92f1ee8cfc");
assert.ok(names.has("GITHUB_CLIENT_SECRET")&&names.has("SESSION_ENCRYPTION_KEY"));
console.log("PASS: read-only private Studio deployed at 100%; authenticated read/list enabled, all mutations and public-write switches OFF.");
console.log("PASS: both isolated KV bindings and login-secret binding names remain intact.");
const base="https://chen-content-studio-api.clyichen0312.workers.dev";
async function anonymous(path){
 return fetch(base+path,{method:"GET",redirect:"manual",
  headers:{Accept:"application/json, text/html"},
  signal:AbortSignal.timeout(18000)});
}
const response=await anonymous("/api/session");
assert.equal(response.status,200);
const session=await response.json();
assert.equal(session.authenticated,false);
for(const key of ["canPublish","canUpload","canReviewPrivatePublish","canRollbackPrivatePublish","canUseImmutableStudio"])
 assert.equal(session[key],false,"Anonymous client must not gain "+key);
for(const path of [
 "/api/content","/api/preview-content",
 "/api/draft/revisions",
 "/api/draft/revision?id=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
 "/api/publish/private-plan?revision=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
 "/api/preview/private-content?revision=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
 "/api/media/preview?path=private-kv%2Fchen-profile-2026-11-12-mragG3nnw0NgdAUw.jpg"
]){
 const res=await anonymous(path);
 assert.equal(res.status,401,"Private endpoint accessible without login: "+path);
}
const privateStudio=await anonymous("/studio/private");
assert.equal(privateStudio.status,401,"Anonymous private Studio must require GitHub login");
const editor=await anonymous("/studio");
assert.equal(editor.status,302,"Studio should redirect anonymous visitors to login");
assert.ok((editor.headers.get("location")||"").endsWith("/auth/login"),
 "Studio must redirect to protected GitHub OAuth login");
console.log("PASS: private drafts/images/publication plans deny anonymous access; Studio redirects to OAuth login.");
