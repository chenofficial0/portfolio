import assert from "node:assert/strict";
import {readPrivateDraft,writePrivateDraft,initializePrivateDraft,PRIVATE_DRAFT_KEY} from "./src/private-kv-draft.js";
const map=new Map();
const env={PRIVATE_DRAFT_KV:{
 get:async k=>map.get(k)??null,
 put:async(k,v)=>map.set(k,v)
}};
const validate=d=>!!d&&typeof d==="object"&&typeof d.about==="object"&&typeof d.profile==="object";
const data={about:{name:"CHEN"},profile:{photo:""},contact:{},works:[],gallery:[]};
assert.equal(await readPrivateDraft(env),null);
await assert.rejects(writePrivateDraft({}, {data,expectedSha:null,validate}),/UNAVAILABLE/);
await assert.rejects(writePrivateDraft(env,{data,expectedSha:"incorrect",validate}),/STALE/);
const saved=await initializePrivateDraft(env,{data,validate});
assert.equal(saved.private,true);
assert.match(saved.sha,/^[a-f0-9]{64}$/);
assert.deepEqual((await readPrivateDraft(env)).data,data);
await assert.rejects(initializePrivateDraft(env,{data,validate}),/STALE/);
await assert.rejects(writePrivateDraft(env,{data:{},expectedSha:saved.sha,validate}),/INVALID/);
const next=structuredClone(data);
next.about.name="CHEN. PORTFOLIO";
const latest=await writePrivateDraft(env,{data:next,expectedSha:saved.sha,validate});
assert.notEqual(latest.sha,saved.sha);
await assert.rejects(writePrivateDraft(env,{data,expectedSha:saved.sha,validate}),/STALE/);
assert.equal((await readPrivateDraft(env)).data.about.name,"CHEN. PORTFOLIO");
map.set(PRIVATE_DRAFT_KEY,"corrupted");
await assert.rejects(readPrivateDraft(env),/CORRUPT/);
console.log("PASS: isolated draft initialization, read/write, stale version, validation and corruption rejection.");
