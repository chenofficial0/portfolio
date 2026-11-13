import assert from "node:assert/strict";
import {auditPrivateNamespace} from "./src/private-kv-migration-audit.js";
let calls=[];
const envFor=(keys,complete=true)=>({PRIVATE_DRAFT_KV:{
  get:async()=>null,
  list:async args=>{calls.push(args);return {keys:keys.map(name=>({name})),list_complete:complete}} 
}});
const blank=await auditPrivateNamespace(envFor([]));
assert.deepEqual(calls,[{limit:100}]);
assert.equal(blank.ready,true);
assert.equal(blank.entries,0);
assert.equal(blank.performedWrites,false);
assert.equal(blank.guaranteesGlobalConsistency,false);
assert.equal(blank.guaranteesExclusiveAccess,false);
const occupied=await auditPrivateNamespace(envFor(["draft-revision-v1/abc"]));
assert.equal(occupied.ready,false);
assert.equal(occupied.reason,"PRIVATE_NAMESPACE_NOT_EMPTY");
assert.equal(occupied.hasKnownKeys,true);
const unknown=await auditPrivateNamespace(envFor(["unknown-inventory"]));
assert.equal(unknown.ready,false);
assert.equal(unknown.hasKnownKeys,false);
const legacy=await auditPrivateNamespace(envFor(["content-draft-v1"]));
assert.equal(legacy.ready,false);
assert.equal(legacy.hasKnownKeys,true);
await assert.rejects(auditPrivateNamespace(envFor([],false)),/PRIVATE_NAMESPACE_INVENTORY_INCOMPLETE/);
await assert.rejects(auditPrivateNamespace({}),/PRIVATE_NAMESPACE_UNAVAILABLE/);
await assert.rejects(auditPrivateNamespace({PRIVATE_DRAFT_KV:{
  list:async()=>({keys:[{name:""}],list_complete:true}),get:async()=>null
}}),/PRIVATE_NAMESPACE_INVENTORY_INVALID/);
await assert.rejects(auditPrivateNamespace({PRIVATE_DRAFT_KV:{
  list:async()=>{throw Error("REMOTE_KV_ERROR")},get:async()=>null
}}),/REMOTE_KV_ERROR/);
console.log("PASS: private namespace occupancy is checked read-only and fails closed on missing/partial/corrupt inventory.");
