// CHEN. Strict candidate configuration acceptance: read-only private Studio.
// This test checks config and code paths without authorizing a live deployment.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=await readFile(path.join(root,"backend/wrangler-private-readonly.toml"),"utf8");
const live=await readFile(path.join(root,"backend/wrangler.toml"),"utf8");
const worker=await readFile(path.join(root,"backend/src/worker.js"),"utf8");
const ui=await readFile(path.join(root,"admin/studio.html"),"utf8");
const flag=(text,key)=>{
 const m=text.match(new RegExp("^"+key+"\\s*=\\s*\\\"(true|false)\\\"\\s*$","m"));
 assert.ok(m,"Feature flag missing or duplicate: "+key);
 assert.equal((text.match(new RegExp("^"+key+"\\s*=","gm"))||[]).length,1);
 return m[1];
};
const readFlags=["ENABLE_IMMUTABLE_DRAFTS","ENABLE_REVISION_COMPARISON","ENABLE_PRIVATE_STUDIO"];
for(const key of readFlags){
 assert.equal(flag(source,key),"true",key+" not enabled for authenticated read-only Studio");
 assert.equal(flag(live,key),"false",key+" has unexpectedly changed in standard deployment");
}
const restricted=["ENABLE_PRIVATE_DRAFTS","ENABLE_IMMUTABLE_DRAFT_WRITES","ENABLE_MERGE_SAVES",
 "ENABLE_CONTENT_WRITES","ENABLE_KV_MEDIA_UPLOADS","ENABLE_KV_MEDIA_DELETES",
 "ENABLE_MEDIA_UPLOADS","ENABLE_LIVE_PUBLISH",
 "ENABLE_PRIVATE_PUBLISH_PLANS","ENABLE_PRIVATE_PUBLISH_CONFIRM",
 "ENABLE_PRIVATE_ROLLBACK","ENABLE_MIGRATION_AUDIT"];
for(const key of restricted){
 assert.equal(flag(source,key),"false","Private read-only candidate would permit "+key);
 assert.equal(flag(live,key),"false","Standard configuration would permit "+key);
}
assert.equal(flag(source,"ENABLE_DRAFT_SAVES"),"true");
assert.match(worker,/ENABLE_IMMUTABLE_DRAFT_WRITES!=="true"/);
assert.match(worker,/canAppendImmutableDraft:/);
assert.match(ui,/canAppendImmutableDraft/);
assert.match(ui,/publish\.hidden=apiSession\?\.canAppendImmutableDraft!==true/);
for(const binding of ['binding = "STUDIO_KV"','binding = "PRIVATE_DRAFT_KV"']){
 assert.ok(source.includes(binding),"KV binding missing: "+binding);
}
assert.match(source,/keep_vars\s*=\s*true/);
console.log("PASS: staged read-only private Studio enables only authenticated listing and preview; all KV mutations and publication remain disabled.");
