// CHEN read-only verification of uploaded inactive version and live deployment.
// No deploy, mutation, secret-value logging, or access to draft/media content.
const SCRIPT="chen-content-studio-api";
const UPLOADED_ID="e5e7e485-555a-4519-a1a7-e833e8421396";
const PREVIOUS_ACTIVE_ID="da3650c4-7785-4e81-b5d6-71cb817e2da1";
const requiredFlags=["ENABLE_CONTENT_WRITES","ENABLE_MEDIA_UPLOADS","ENABLE_LIVE_PUBLISH",
"ENABLE_IMMUTABLE_DRAFTS","ENABLE_PRIVATE_STUDIO","ENABLE_MERGE_SAVES",
"ENABLE_KV_MEDIA_UPLOADS","ENABLE_KV_MEDIA_DELETES","ENABLE_PRIVATE_DRAFTS",
"ENABLE_REVISION_COMPARISON","ENABLE_MIGRATION_AUDIT",
"ENABLE_PRIVATE_PUBLISH_PLANS","ENABLE_PRIVATE_PUBLISH_CONFIRM","ENABLE_PRIVATE_ROLLBACK"];
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_WORKER_EDITOR_TOKEN;
async function cfGet(path){
 const res=await fetch("https://api.cloudflare.com/client/v4/accounts/"+account+
  "/workers/scripts/"+SCRIPT+path,{
  method:"GET",headers:{Authorization:"Bearer "+token,Accept:"application/json"},
  signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error("VERSION_AUDIT_HTTP_"+res.status);
 const body=await res.json();
 if(body?.success!==true)throw Error("VERSION_AUDIT_REJECTED");
 return body.result;
}
try{
 if(!token||!account||!/^[0-9a-f]{32}$/.test(account))
  throw Error("MISSING_VERSION_AUDIT_CREDENTIALS");
 const [uploaded,deploymentsResponse]=await Promise.all([
  cfGet("/versions/"+UPLOADED_ID),
  cfGet("/deployments?per_page=5")
 ]);
 if(uploaded?.id!==UPLOADED_ID)throw Error("UPLOADED_VERSION_ID_MISMATCH");
 const deployments=deploymentsResponse?.deployments;
 if(!Array.isArray(deployments)||!deployments.length)throw Error("NO_DEPLOYMENT_EVIDENCE");
 const active=deployments[0].versions;
 if(!Array.isArray(active)||active.length!==1||
   active[0].version_id!==PREVIOUS_ACTIVE_ID||active[0].percentage!==100)
  throw Error("PRODUCTION_TRAFFIC_CHANGED");
 if(active.some(v=>v.version_id===UPLOADED_ID))
  throw Error("INACTIVE_VERSION_IS_SERVING_TRAFFIC");
 const bindings=uploaded.resources?.bindings;
 if(!Array.isArray(bindings)){
  console.log("Uploaded version bindings shape: "+(bindings===null?"null":Array.isArray(bindings)?"array":typeof bindings));
  throw Error("VERSION_BINDINGS_UNAVAILABLE");
 }
 const names=new Set(bindings.map(item=>item?.name).filter(Boolean));
 for(const key of ["GITHUB_CLIENT_SECRET","SESSION_ENCRYPTION_KEY"]){
  if(!names.has(key))throw Error("REQUIRED_LOGIN_SECRET_BINDING_MISSING_"+key);
 }
 const vars=new Map(),namespaces=new Map();
 for(const b of bindings){
  if(!b||typeof b!=="object")throw Error("MALFORMED_BINDING");
  if(b.type==="plain_text")vars.set(b.name,b.text);
  if(b.type==="kv_namespace")namespaces.set(b.name,b.namespace_id);
 }
 for(const key of requiredFlags){
  if(vars.get(key)!=="false")throw Error("UNSAFE_VERSION_FLAG_"+key);
 }
 if(namespaces.get("STUDIO_KV")!=="f5115459b9a0488186850f92f1ee8cfc"||
    namespaces.get("PRIVATE_DRAFT_KV")!=="aad4672cc5474625b8fc0f070e75bc99")
  throw Error("NAMESPACE_BINDINGS_MISMATCH");
 console.log("PASS: inactive uploaded Worker version ID and disabled feature flags verified.");
 console.log("PASS: both KV bindings match their intended independent namespaces.");
 console.log("PASS: required OAuth and session-secret binding names are present.");
 console.log("PASS: production traffic remains 100% on previous version; no new deployment.");
}catch(err){
 console.error("BLOCKED: "+String(err.message).slice(0,120));
 process.exitCode=3;
}
