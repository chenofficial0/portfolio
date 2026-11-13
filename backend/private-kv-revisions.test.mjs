import assert from "node:assert/strict";
import {appendRevision,readRevision,validRevisionId,REVISION_PREFIX} from "./src/private-kv-revisions.js";
const db=new Map();
const kv={get:async key=>db.get(key)??null,put:async (key,value)=>{
  if(db.has(key))throw Error("Overwriting immutable revision prohibited in test store");
  db.set(key,value);
}};
const env={PRIVATE_DRAFT_KV:kv};
const validate=data=>!!data&&typeof data==="object"&&typeof data.about?.name==="string";
const first={about:{name:"CHEN"},profile:{photo:""},works:[],gallery:[],contact:{}};
const saved=await appendRevision(env,{data:first,validate});
assert.equal(validRevisionId(saved.id),true);
assert.equal(saved.immutable,true);
const copy=await readRevision(env,saved.id,{validate});
assert.deepEqual(copy.data,first);
const a={...structuredClone(first),about:{name:"Computer edit"}};
const b={...structuredClone(first),about:{name:"Phone edit"}};
const [fromComputer,fromPhone]=await Promise.all([
  appendRevision(env,{data:a,parentId:saved.id,validate}),
  appendRevision(env,{data:b,parentId:saved.id,validate})
]);
assert.notEqual(fromComputer.id,fromPhone.id);
assert.equal((await readRevision(env,fromComputer.id,{validate})).data.about.name,"Computer edit");
assert.equal((await readRevision(env,fromPhone.id,{validate})).data.about.name,"Phone edit");
assert.equal((await readRevision(env,saved.id,{validate})).data.about.name,"CHEN");
assert.equal(db.size,3);
assert.equal(await readRevision(env,"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",{validate}),null);
await assert.rejects(appendRevision(env,{data:first,parentId:"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",validate}),/PARENT_REVISION_UNAVAILABLE/);
await assert.rejects(appendRevision(env,{data:{},validate}),/REVISION_INVALID/);
await assert.rejects(readRevision(env,"../../etc/passwd",{validate}),/INVALID_REVISION_ID/);
assert.ok([...db.keys()].every(key=>key.startsWith(REVISION_PREFIX)));
console.log("PASS: immutable snapshots preserve concurrent branches and never overwrite previous revisions.");
