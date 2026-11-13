// Post-upload inspection of a newly created, inactive, read-only private Studio
// Worker version. Only GET requests. No token or secret contents are logged.
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_WORKER_EDITOR_TOKEN;
const script="chen-content-studio-api";
const previous="e5e7e485-555a-4519-a1a7-e833e8421396"; // audited v85
const base="https://api.cloudflare.com/client/v4/accounts/"+account+"/workers/scripts/"+script;
async function read(path){
 const r=await fetch(base+path,{headers:{Authorization:"Bearer "+token,Accept:"application/json"},
  signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw Error("CLOUDFLARE_READ_HTTP_"+r.status);
 const p=await r.json();
 if(p.success!==true)throw Error("CLOUDFLARE_READ_REJECTED");
 return p.result;
}
const flag=(all,name,expected)=>{
 const v=all.find(x=>x.name===name&&x.type==="plain_text");
 if(!v||v.text!==expected)throw Error("UNSAFE_PRIVATE_READONLY_FLAG_"+name);
};
try{
 if(!token||!/^[a-f0-9]{32}$/.test(account||""))
  throw Error("MISSING_SCOPED_READONLY_AUDIT_CREDENTIALS");
 const [list,deployments]=await Promise.all([
  read("/versions?per_page=5"),read("/deployments?per_page=2")
 ]);
 if(!Array.isArray(list?.items)||!Array.isArray(deployments?.deployments))
  throw Error("CLOUDFLARE_API_FORMAT_UNEXPECTED");
 const latest=list.items[0];
 if(!latest||latest.id===previous||latest.number<=85||latest.metadata?.source!=="wrangler")
  throw Error("NEW_PRIVATE_READONLY_VERSION_NOT_FOUND");
 const created=Date.parse(latest.metadata?.created_on||"");
 if(!Number.isFinite(created)||Date.now()-created>15*60*1000||
    Date.now()-created < -120000)
  throw Error("NEW_WORKER_VERSION_TIMESTAMP_NOT_RECENT");
 const current=deployments.deployments[0]?.versions;
 if(!Array.isArray(current)||current.length!==1||current[0].version_id!==previous||
    current[0].percentage!==100)
  throw Error("PRODUCTION_WORKER_TRAFFIC_CHANGED");
 const ver=await read("/versions/"+latest.id);
 const bindings=ver?.resources?.bindings;
 if(!Array.isArray(bindings))throw Error("CANDIDATE_BINDINGS_UNAVAILABLE");
 for(const k of ["ENABLE_IMMUTABLE_DRAFTS","ENABLE_REVISION_COMPARISON","ENABLE_PRIVATE_STUDIO"])
  flag(bindings,k,"true");
 for(const k of [
  "ENABLE_IMMUTABLE_DRAFT_WRITES","ENABLE_PRIVATE_DRAFTS","ENABLE_CONTENT_WRITES",
  "ENABLE_LIVE_PUBLISH","ENABLE_PRIVATE_PUBLISH_PLANS","ENABLE_PRIVATE_PUBLISH_CONFIRM",
  "ENABLE_PRIVATE_ROLLBACK","ENABLE_KV_MEDIA_UPLOADS","ENABLE_KV_MEDIA_DELETES",
  "ENABLE_MEDIA_UPLOADS","ENABLE_MERGE_SAVES","ENABLE_MIGRATION_AUDIT"
 ])flag(bindings,k,"false");
 flag(bindings,"ENABLE_DRAFT_SAVES","true");
 const ns=new Map(bindings.filter(x=>x.type==="kv_namespace").map(x=>[x.name,x.namespace_id]));
 if(ns.get("STUDIO_KV")!=="f5115459b9a0488186850f92f1ee8cfc"||
    ns.get("PRIVATE_DRAFT_KV")!=="aad4672cc5474625b8fc0f070e75bc99")
  throw Error("CANDIDATE_KV_BINDINGS_UNSAFE");
 for(const n of ["GITHUB_CLIENT_SECRET","SESSION_ENCRYPTION_KEY"])
  if(!bindings.some(x=>x.name===n))throw Error("MISSING_LOGIN_SECRET_BINDING_"+n);
 console.log("PASS: new read-only private Studio Worker is uploaded but NOT deployed.");
 console.log("PASS: preview/list only, all write, upload, and publication switches OFF.");
 console.log("PASS: live production still runs v85 at 100%.");
 console.log("VERIFIED_READONLY_VERSION_ID="+latest.id);
}catch(error){
 console.error("BLOCKED: "+String(error.message).slice(0,120));
 process.exitCode=3;
}
