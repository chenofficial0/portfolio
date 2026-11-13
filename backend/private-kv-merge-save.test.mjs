import assert from "node:assert/strict";
import {appendRevision,readRevision} from "./src/private-kv-revisions.js";
import {resolveSelectedMerge,saveReviewedMerge} from "./src/private-kv-merge-save.js";

const blobs=new Map();
const env={PRIVATE_DRAFT_KV:{
  get:async key=>blobs.get(key)??null,
  put:async (key,value)=>{
    if(blobs.has(key))throw Error("An immutable revision was overwritten");
    blobs.set(key,value);
  }
}};
const validate=data=>data&&typeof data==="object"&&!!data.about&&!!data.profile&&
  Array.isArray(data.works)&&Array.isArray(data.gallery);
const original={about:{name:"Original"},profile:{photo:""},contact:{},works:[],gallery:[]};
const root=await appendRevision(env,{data:original,validate});
const fromLeft={...structuredClone(original),about:{name:"Desktop"}};
const fromRight={...structuredClone(original),about:{name:"Mobile"}};
const left=await appendRevision(env,{data:fromLeft,parentId:root.id,validate});
const right=await appendRevision(env,{data:fromRight,parentId:root.id,validate});
const input={base:root.id,left:left.id,right:right.id,decisions:{"/about/name":"left"}};
const preview=await resolveSelectedMerge(env,input,validate);
assert.equal(preview.preview.ready,true);
assert.equal(preview.preview.merged.about.name,"Desktop");
assert.match(preview.digest,/^[a-f0-9]{64}$/);
const count=blobs.size;
await assert.rejects(saveReviewedMerge(env,{...input,previewDigest:preview.digest},validate),/MERGE_CONFIRMATION_REQUIRED/);
await assert.rejects(saveReviewedMerge(env,{...input,previewDigest:"0".repeat(64),confirmation:"SAVE_MERGE_AS_NEW_REVISION"},validate),/MERGE_PREVIEW_CHANGED/);
assert.equal(blobs.size,count);
const out=await saveReviewedMerge(env,{
  ...input,previewDigest:preview.digest,confirmation:"SAVE_MERGE_AS_NEW_REVISION"
},validate);
assert.equal(out.ok,true);
assert.equal(out.originalRevisionsPreserved,true);
assert.equal(out.published,false);
assert.equal(out.revision.parentId,root.id);
assert.equal(blobs.size,count+1);
const saved=await readRevision(env,out.revision.id,{validate});
assert.equal(saved.data.about.name,"Desktop");
assert.deepEqual(saved.mergeSources,{left:left.id,right:right.id});
assert.equal((await readRevision(env,root.id,{validate})).data.about.name,"Original");
assert.equal((await readRevision(env,left.id,{validate})).data.about.name,"Desktop");
assert.equal((await readRevision(env,right.id,{validate})).data.about.name,"Mobile");
const incomplete=await resolveSelectedMerge(env,{...input,decisions:{}},validate);
assert.equal(incomplete.preview.ready,false);
await assert.rejects(saveReviewedMerge(env,{...input,decisions:{},previewDigest:preview.digest,confirmation:"SAVE_MERGE_AS_NEW_REVISION"},validate),/MERGE_CONFLICTS_UNRESOLVED/);
console.log("PASS: reviewed merge save checks confirmation/digest, saves NEW immutable revision and preserves three sources.");
