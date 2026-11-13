import assert from "node:assert/strict";
import {appendRevision} from "./src/private-kv-revisions.js";
import {listDraftRevisions} from "./src/private-kv-revision-list.js";
const saved=new Map();
const env={PRIVATE_DRAFT_KV:{
  get:async key=>saved.get(key)??null,
  put:async(key,value)=>saved.set(key,value),
  list:async ({prefix,limit,cursor})=>{
    const all=[...saved.keys()].filter(key=>key.startsWith(prefix)).sort();
    const start=cursor?Number(cursor.slice(1)):0;
    const keys=all.slice(start,start+limit).map(name=>({name}));
    return {keys,list_complete:start+limit>=all.length,
      cursor:start+limit<all.length?"p"+(start+limit):""};
  }
}};
const validate=data=>data&&typeof data==="object"&&data.about&&data.profile;
const data={about:{},profile:{},contact:{},works:[],gallery:[]};
const root=await appendRevision(env,{data,validate});
const edit1=await appendRevision(env,{data:{...data,about:{name:"Computer"}},parentId:root.id,validate});
const edit2=await appendRevision(env,{data:{...data,about:{name:"Phone"}},parentId:root.id,validate});
let res=await listDraftRevisions(env,{validate});
assert.equal(res.revisions.length,3);
assert.equal(res.complete,true);
assert.equal(res.nextCursor,null);
assert.deepEqual(new Set(res.revisions.map(x=>x.id)),new Set([root.id,edit1.id,edit2.id]));
assert.equal(res.revisions.find(x=>x.id===edit1.id).parentId,root.id);
assert.equal("data" in res.revisions[0],false);

for(let i=0;i<33;i++)await appendRevision(env,{data:{...data,about:{i}},validate});
const first=await listDraftRevisions(env,{validate});
assert.equal(first.revisions.length,30);
assert.equal(first.complete,false);
const second=await listDraftRevisions(env,{cursor:first.nextCursor,validate});
assert.equal(second.revisions.length,6);
assert.equal(second.complete,true);
assert.equal(new Set([...first.revisions,...second.revisions].map(x=>x.id)).size,36);
await assert.rejects(listDraftRevisions(env,{cursor:"../bad",validate}),/INVALID_REVISION_CURSOR/);
await assert.rejects(listDraftRevisions({}, {validate}),/REVISION_LIST_STORAGE_UNAVAILABLE/);
const unsafe={PRIVATE_DRAFT_KV:{
  get:async()=>null,
  list:async()=>({keys:[{name:"draft-revision-v1/../bad"}],list_complete:true})
}};
await assert.rejects(listDraftRevisions(unsafe,{validate}),/REVISION_LIST_INVALID/);
const missing={PRIVATE_DRAFT_KV:{
  get:async()=>null,
  list:async()=>({keys:[{name:"draft-revision-v1/"+root.id}],list_complete:true})
}};
await assert.rejects(listDraftRevisions(missing,{validate}),/REVISION_LIST_STALE/);
console.log("PASS: private revision listing, strict cursors, pagination and metadata-only responses.");
