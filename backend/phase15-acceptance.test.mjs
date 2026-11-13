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
 "ENABLE_KV_MEDIA_UPLOADS","ENABLE_KV_MEDIA_DELETES","ENABLE_LIVE_PUBLISH"
]){
 assert.equal(get(key),"false","Unsafe feature enabled without acceptance: "+key);
}
assert.equal(get("ENABLE_DRAFT_SAVES"),"true");
const worker=await readFile(path.join(root,"backend/src/worker.js"),"utf8");
for(const route of ["/api/content","/api/draft/revision","/api/draft/revisions",
 "/api/draft/compare","/api/draft/merge-preview","/api/draft/merge-save",
 "/api/media/private","/api/publish/confirm"]){
 assert.ok(worker.includes(route),"Missing API route: "+route);
}
const html=await readFile(path.join(root,"backend/src/revision-compare-page.js"),"utf8");
assert.ok(html.includes("window.confirm"),"Merge requires direct confirmation");
assert.ok(html.includes("canSaveMerge"),"Merge UI must be gated by session");
assert.ok(html.includes("same-origin"),"Requests must use same-origin credential mode");
console.log("PASS: all live/publish/media/private/merge flags remain disabled and consent gates are present.");
