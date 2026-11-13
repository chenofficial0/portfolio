// Phase 15: configuration safety gate. Runs only on checked-out feature branch.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const toml=await readFile(path.join(root,"backend/wrangler.toml"),"utf8");
const get=(key)=>{
 const lines=toml.split(/\r?\n/).filter(line=>line.trim().startsWith(key+" = "));
 assert.equal(lines.length,1,"Missing or duplicate configuration: "+key);
 return lines[0].match(/^\s*[^=]+ = "([^"]+)"\s*$/)?.[1];
};
for(const key of [
 "ENABLE_CONTENT_WRITES","ENABLE_MEDIA_UPLOADS","ENABLE_PRIVATE_DRAFTS",
 "ENABLE_IMMUTABLE_DRAFTS","ENABLE_REVISION_COMPARISON","ENABLE_MERGE_SAVES",
 "ENABLE_KV_MEDIA_UPLOADS","ENABLE_KV_MEDIA_DELETES","ENABLE_LIVE_PUBLISH",
 "ENABLE_MIGRATION_AUDIT","ENABLE_PRIVATE_STUDIO"
]){
 assert.equal(get(key),"false","Unsafe feature enabled without acceptance: "+key);
}
assert.equal(get("ENABLE_DRAFT_SAVES"),"true");
// The original session storage and new PRIVATE_DRAFT_KV must be distinct.
const namespaceBlocks=[...toml.matchAll(/\[\[kv_namespaces\]\]([\s\S]*?)(?=\[\[kv_namespaces\]\]|\[vars\]|$)/g)];
assert.equal(namespaceBlocks.length,2,"Expected exactly two KV namespace bindings");
const namespaceValues=namespaceBlocks.map(([,body])=>{
 const binding=body.match(/^binding = "([A-Z_]+)"$/m)?.[1];
 const id=body.match(/^id = "([a-f0-9]{32})"$/m)?.[1];
 assert.ok(binding&&id,"Invalid KV namespace block");
 return {binding,id};
});
assert.deepEqual(new Set(namespaceValues.map(x=>x.binding)),
 new Set(["STUDIO_KV","PRIVATE_DRAFT_KV"]));
assert.equal(new Set(namespaceValues.map(x=>x.id)).size,2,
 "Private media/draft KV must not share session storage");
assert.equal(namespaceValues.find(x=>x.binding==="STUDIO_KV").id,
 "f5115459b9a0488186850f92f1ee8cfc");
assert.equal(namespaceValues.find(x=>x.binding==="PRIVATE_DRAFT_KV").id,
 "aad4672cc5474625b8fc0f070e75bc99");

const worker=await readFile(path.join(root,"backend/src/worker.js"),"utf8");
for(const route of ["/api/content","/api/draft/revision","/api/draft/revisions",
 "/api/draft/compare","/api/draft/merge-preview","/api/draft/merge-save",
 "/api/media/private","/api/publish/confirm","/api/migration/readiness","/studio/private"]){
 assert.ok(worker.includes(route),"Missing API route: "+route);
}
const html=await readFile(path.join(root,"backend/src/revision-compare-page.js"),"utf8");
assert.ok(html.includes("window.confirm"),"Merge requires direct confirmation");
assert.ok(html.includes("canSaveMerge"),"Merge UI must be gated by session");
assert.ok(html.includes("same-origin"),"Requests must use same-origin credential mode");
const stagedStudio=await readFile(path.join(root,"admin/studio.html"),"utf8");
assert.match(stagedStudio,/private-revision-picker/);
assert.match(stagedStudio,/canUseImmutableStudio/);
assert.match(stagedStudio,/api\/draft\/revision/);
assert.match(stagedStudio,/api\/draft\/revisions/);
assert.match(stagedStudio,/privateRevisionId/);
console.log("PASS: all live/publish/media/private/merge flags remain disabled and consent gates are present.");
