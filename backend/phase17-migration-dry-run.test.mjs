// Phase 17: synthetic migration and rollback dry run; NO production I/O.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {appendRevision,readRevision} from "./src/private-kv-revisions.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=await readFile(path.join(root,"content/site.json"),"utf8");
const snapshot=JSON.parse(source);
const valid=d=>!!d&&typeof d==="object"&&!!d.about&&!!d.profile&&!!d.contact&&
  Array.isArray(d.works)&&Array.isArray(d.gallery);
assert.ok(valid(snapshot));
const mock=new Map();
const env={PRIVATE_DRAFT_KV:{
  get:async key=>mock.get(key)??null,
  put:async (key,value)=>{
    if(mock.has(key))throw Error("Immutable key overwritten");
    mock.set(key,value);
  }
}};
const first=await appendRevision(env,{data:snapshot,validate:valid});
const loaded=await readRevision(env,first.id,{validate:valid});
assert.deepEqual(loaded.data,snapshot);
assert.deepEqual(loaded.data.about.hero_images,snapshot.about.hero_images);
assert.equal(loaded.data.profile.photo,snapshot.profile.photo);
const edited=structuredClone(loaded.data);
edited.about.bio_zh="演練修改（不會保存到正式網站）";
const later=await appendRevision(env,{data:edited,parentId:first.id,validate:valid});
assert.notEqual(later.id,first.id);
assert.deepEqual((await readRevision(env,first.id,{validate:valid})).data,snapshot);
assert.equal((await readRevision(env,later.id,{validate:valid})).data.about.bio_zh,edited.about.bio_zh);
assert.equal(await readFile(path.join(root,"content/site.json"),"utf8"),source);
await assert.rejects(appendRevision({}, {data:snapshot,validate:valid}),/REVISION_STORE_UNAVAILABLE/);
const failing={PRIVATE_DRAFT_KV:{get:async()=>null,put:async()=>{throw Error("SIMULATED_WRITE_FAILURE")}}};
await assert.rejects(appendRevision(failing,{data:snapshot,validate:valid}),/SIMULATED_WRITE_FAILURE/);
assert.equal(mock.size,2);
console.log("PASS: mock migration imports identical draft, keeps two image refs, preserves source, and supports rollback by selecting original version.");
