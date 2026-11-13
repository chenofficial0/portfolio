// Controlled deployment of an already-verified Worker version with all new features OFF.
// Immediately verifies public anonymous endpoints, and rolls back to v83 if needed.
// NEVER touches GitHub main, private KV content, or release flags.
const SCRIPT="chen-content-studio-api";
const ID="e5e7e485-555a-4519-a1a7-e833e8421396"; // verified inactive v85
const PREVIOUS="da3650c4-7785-4e81-b5d6-71cb817e2da1"; // verified live v83
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_WORKER_EDITOR_TOKEN;
const origin="https://chen-content-studio-api.clyichen0312.workers.dev";
const requiredOff=["ENABLE_CONTENT_WRITES","ENABLE_MEDIA_UPLOADS","ENABLE_LIVE_PUBLISH",
 "ENABLE_PRIVATE_DRAFTS","ENABLE_IMMUTABLE_DRAFTS","ENABLE_REVISION_COMPARISON",
 "ENABLE_MERGE_SAVES","ENABLE_PRIVATE_STUDIO","ENABLE_PRIVATE_PUBLISH_PLANS",
 "ENABLE_PRIVATE_PUBLISH_CONFIRM","ENABLE_PRIVATE_ROLLBACK","ENABLE_KV_MEDIA_UPLOADS",
 "ENABLE_KV_MEDIA_DELETES","ENABLE_MIGRATION_AUDIT"];
if(!TOKEN||!ACCOUNT||!/^[0-9a-f]{32}$/.test(ACCOUNT)||
 process.env.CHEN_DEPLOY_DISABLED_FEATURES!=="CONFIRM_SAFE_VERSION_ROLLOUT"){
 throw Error("SAFE_ROLLOUT_NOT_AUTHORIZED");
}
const base="https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+
 "/workers/scripts/"+SCRIPT;
async function cf(p,method="GET",body=null){
 const response=await fetch(base+p,{method,headers:{
  Authorization:"Bearer "+TOKEN,Accept:"application/json",
  ...(body?{"Content-Type":"application/json"}:{})
 },...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error("CLOUDFLARE_DEPLOYMENT_HTTP_"+response.status);
 const json=await response.json();
 if(json?.success!==true)throw Error("CLOUDFLARE_DEPLOYMENT_API_FAILED");
 return json.result;
}
async function activeId(){
 const response=await cf("/deployments?per_page=3");
 const recent=response?.deployments?.[0];
 const versions=recent?.versions;
 if(!Array.isArray(versions)||versions.length!==1||versions[0].percentage!==100)
  throw Error("DEPLOYMENT_TRAFFIC_UNEXPECTED");
 return versions[0].version_id;
}
async function postDeployment(version){
 return cf("/deployments","POST",{
  strategy:"percentage",versions:[{percentage:100,version_id:version}],
  annotations:{"workers/message":"CHEN guarded release candidate with private features disabled"}
 });
}
async function smoke(){
 const get=async(path)=>{
  const resp=await fetch(origin+path,{method:"GET",redirect:"manual",
   headers:{Accept:"text/html,application/json"},signal:AbortSignal.timeout(15000)});
  return resp;
 };
 const ss=await get("/api/session");
 if(ss.status!==200||!ss.headers.get("content-type")?.includes("application/json"))
  throw Error("SESSION_SMOKE_FAILED");
 const session=await ss.json();
 if(session.authenticated!==false||session.canPublish!==false||
  session.canUseImmutableStudio!==false)throw Error("UNEXPECTED_SESSION_CAPABILITIES");
 const content=await get("/api/content");
 if(content.status!==401)throw Error("ANONYMOUS_CONTENT_NOT_PROTECTED");
 const editor=await get("/studio");
 if(editor.status!==200||!editor.headers.get("content-type")?.includes("text/html"))
  throw Error("LEGACY_EDITOR_UNAVAILABLE");
 const homepage=await fetch("https://chenofficial0.github.io/portfolio/",{
  signal:AbortSignal.timeout(15000)});
 if(homepage.status!==200)throw Error("PUBLIC_PAGES_UNAVAILABLE");
}
let attempted=false;
try{
 const before=await activeId();
 if(before!==PREVIOUS)throw Error("LIVE_WORKER_VERSION_CHANGED_REFUSE_DEPLOY");
 const uploaded=await cf("/versions/"+ID);
 if(uploaded?.id!==ID||!Array.isArray(uploaded.resources?.bindings))
  throw Error("UPLOADED_VERSION_NOT_VERIFIED");
 const vars=new Map(),bound=new Map(),names=new Set();
 for(const item of uploaded.resources.bindings){
  names.add(item.name);
  if(item.type==="plain_text")vars.set(item.name,item.text);
  if(item.type==="kv_namespace")bound.set(item.name,item.namespace_id);
 }
 for(const flag of requiredOff){
  if(vars.get(flag)!=="false")throw Error("UNSAFE_FLAG_"+flag);
 }
 if(vars.get("ENABLE_DRAFT_SAVES")!=="true")throw Error("LEGACY_DRAFT_SETTING_CHANGED");
 if(bound.get("STUDIO_KV")!=="f5115459b9a0488186850f92f1ee8cfc"||
    bound.get("PRIVATE_DRAFT_KV")!=="aad4672cc5474625b8fc0f070e75bc99"||
    !names.has("GITHUB_CLIENT_SECRET")||!names.has("SESSION_ENCRYPTION_KEY"))
  throw Error("REQUIRED_BINDING_MISSING");
 console.log("PASS: deployment candidate verified, all private writes and publishing locked.");
 attempted=true;
 await postDeployment(ID);
 if(await activeId()!==ID)throw Error("NEW_VERSION_NOT_ACTIVE");
 await smoke();
 console.log("PASS: v85 active with all private features locked; anonymous API and public site healthy.");
}catch(error){
 console.error("DEPLOYMENT_VERIFICATION_FAILED: "+String(error.message).slice(0,110));
 if(attempted){
  try{
   const current=await activeId();
   if(current===ID){
    await postDeployment(PREVIOUS);
    if(await activeId()!==PREVIOUS)throw Error("ROLLBACK_DEPLOYMENT_NOT_CONFIRMED");
    console.log("RECOVERED: Worker traffic restored to previous v83.");
   }else console.log("ROLLBACK_SKIPPED: current traffic is not the candidate; manual review needed.");
  }catch(rollbackError){
   console.error("URGENT_REVIEW_REQUIRED: "+String(rollbackError.message).slice(0,110));
  }
 }
 process.exitCode=3;
}
