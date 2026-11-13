import assert from "node:assert/strict";
import {auditCloudflareNamespace} from "./src/cloudflare-remote-kv-audit.js";
const account="a".repeat(32),token="test-token-nonsecret";
const id="aad4672cc5474625b8fc0f070e75bc99";
const detail={success:true,result:{id,title:"CHEN_PRIVATE_DRAFTS"}};
const empty={success:true,result:[],result_info:{}};
const makeFetch=(a,b,observed=[])=>async(url,options)=>{
 observed.push({url,method:options.method,auth:options.headers.Authorization});
 return {ok:true,status:200,json:async()=>url.includes("/keys?")?b:a};
};
const calls=[];
const result=await auditCloudflareNamespace({token,account,fetchImpl:makeFetch(detail,empty,calls)});
assert.equal(result.identityVerified,true);
assert.equal(result.readyForControlledMigration,true);
assert.equal(result.globalConsistencyGuaranteed,false);
assert.equal(result.readOnly,true);
assert.equal(calls.length,2);
assert.ok(calls.every(c=>c.method==="GET"));
assert.ok(calls.every(c=>c.url.includes("/"+id)));
assert.ok(calls.every(c=>c.auth==="Bearer "+token));
assert.equal((await auditCloudflareNamespace({token,account,
 fetchImpl:makeFetch(detail,{success:true,result:[{name:"existing-secret-name"}],result_info:{}})}))
 .readyForControlledMigration,false);
assert.equal((await auditCloudflareNamespace({token,account,
 fetchImpl:makeFetch(detail,{success:true,result:[],result_info:{cursor:"next"}})}))
 .readyForControlledMigration,false);
await assert.rejects(auditCloudflareNamespace({token,account,fetchImpl:makeFetch(
 {success:true,result:{id,title:"WRONG"}},empty)}),/NAMESPACE_IDENTITY_MISMATCH/);
await assert.rejects(auditCloudflareNamespace({token,account,fetchImpl:makeFetch(
 detail,{success:true,result:{},result_info:{}})}),/NAMESPACE_INVENTORY_INVALID/);
await assert.rejects(auditCloudflareNamespace({token,account,fetchImpl:async()=>({
 ok:false,status:403
})}),/HTTP_403/);
await assert.rejects(auditCloudflareNamespace({account,fetchImpl:makeFetch(detail,empty)}),
 /REMOTE_AUDIT_CREDENTIALS_MISSING/);
console.log("PASS: remote KV audit uses GET only; rejects wrong namespace, occupied/partial inventory and unavailable auth.");
