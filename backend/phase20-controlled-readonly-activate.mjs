// Controlled read-only private Studio rollout from pre-audited inactive version.
// All private writes, media uploads, and release remain OFF; rollback to v85 on failures.
// NEVER touches GitHub main, private KV content, or release flags.
const SCRIPT="chen-content-studio-api";
const ID="6bdc091b-08a8-44d6-a418-4d94e5eb25a7"; // verified inactive private Studio read-only candidate
const PREVIOUS="e5e7e485-555a-4519-a1a7-e833e8421396"; // verified live v85
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_WORKER_EDITOR_TOKEN;
const origin="https://chen-content-studio-api.clyichen0312.workers.dev";
const requiredOn=["ENABLE_IMMUTABLE_DRAFTS","ENABLE_REVISION_COMPARISON","ENABLE_PRIVATE_STUDIO"];
const requiredOff=["ENABLE_CONTENT_WRITES","ENABLE_MEDIA_UPLOADS","ENABLE_LIVE_PUBLISH",
 "ENABLE_PRIVATE_DRAFTS","ENABLE_IMMUTABLE_DRAFT_WRITES","ENABLE_MERGE_SAVES",
 "ENABLE_PRIVATE_PUBLISH_PLANS","ENABLE_PRIVATE_PUBLISH_CONFIRM",
 "ENABLE_PRIVATE_ROLLBACK","ENABLE_KV_MEDIA_UPLOADS","ENABLE_KV_MEDIA_DELETES",
 "ENABLE_MIGRATION_AUDIT"];
if(!TOKEN||!ACCOUNT||!/^[0-9a-f]{32}$/.test(ACCOUNT)||
 process.env.CHEN_DEPLOY_READONLY_STUDIO!=="CONFIRM_READONLY_PRIVATE_STUDIO"){
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
  annotations:{"workers/message":"CHEN private Studio READ-ONLY; no media uploads, draft saves, or public publishing"}
 });
}
async function smoke(){
 const get=async(path)=>fetch(origin+path,{method:"GET",redirect:"manual",
  headers:{Accept:"text/html,application/json"},signal:AbortSignal.timeout(15000)});
 const sessionResponse=await get("/api/session");
 if(sessionResponse.status!==200)throw Error("SESSION_SMOKE_FAILED");
 const session=await sessionResponse.json();
 if(session.authenticated!==false||session.canPublish!==false||
    session.canUseImmutableStudio!==false||
    session.canAppendImmutableDraft!==false||
    session.canReviewPrivatePublish!==false)
    throw Error("ANONYMOUS_SESSION_CAPABILITIES_UNSAFE");
 for(const path of ["/api/content","/api/draft/revisions",
    "/api/draft/revision?id=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "/api/preview/private-content?revision=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "/api/media/preview?path=private-kv%2Fchen-profile-2026-11-12-mragG3nnw0NgdAUw.jpg",
    "/api/publish/private-plan?revision=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"]){
   if((await get(path)).status!==401)throw Error("PRIVATE_ENDPOINT_ANONYMOUS_EXPOSURE");
 }
 const privateEditor=await get("/studio/private");
 if(privateEditor.status!==401)throw Error("PRIVATE_EDITOR_ANONYMOUS_EXPOSURE");
 const editor=await get("/studio");
 if(editor.status!==302||!(editor.headers.get("location")||"").endsWith("/auth/login"))
   throw Error("STUDIO_LOGIN_REDIRECT_FAILED");
 const homepage=await fetch("https://chenofficial0.github.io/portfolio/",{
  signal:AbortSignal.timeout(15000)});
 if(homepage.status!==200)throw Error("PUBLIC_PAGES_UNAVAILABLE");
 const icon=await fetch("https://chenofficial0.github.io/portfolio/favicon.png",{
  signal:AbortSignal.timeout(15000)});
 if(icon.status!==200)throw Error("PUBLIC_FAVICON_UNAVAILABLE");
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
 for(const flag of requiredOn){
  if(vars.get(flag)!=="true")throw Error("READONLY_PREVIEW_FLAG_DISABLED_"+flag);
 }
 for(const flag of requiredOff){
  if(vars.get(flag)!=="false")throw Error("UNSAFE_FLAG_"+flag);
 }
 if(vars.get("ENABLE_DRAFT_SAVES")!=="true")throw Error("LEGACY_DRAFT_SETTING_CHANGED");
 if(bound.get("STUDIO_KV")!=="f5115459b9a0488186850f92f1ee8cfc"||
    bound.get("PRIVATE_DRAFT_KV")!=="aad4672cc5474625b8fc0f070e75bc99"||
    !names.has("GITHUB_CLIENT_SECRET")||!names.has("SESSION_ENCRYPTION_KEY"))
  throw Error("REQUIRED_BINDING_MISSING");
 console.log("PASS: authenticated preview flags enabled, all private writes and publishing locked.");
 attempted=true;
 await postDeployment(ID);
 if(await activeId()!==ID)throw Error("NEW_VERSION_NOT_ACTIVE");
 let verified=false;
 for(let attempt=0;attempt<6;attempt++){
  try{await smoke();verified=true;break}
  catch(error){
   if(attempt===5)throw error;
   await new Promise(resolve=>setTimeout(resolve,2000));
  }
 }
 if(!verified)throw Error("READONLY_STUDIO_SMOKE_UNCONFIRMED");
 console.log("PASS: read-only private Studio Worker live, anonymous resources protected, public site healthy.");
}catch(error){
 console.error("DEPLOYMENT_VERIFICATION_FAILED: "+String(error.message).slice(0,110));
 if(attempted){
  try{
   const current=await activeId();
   if(current===ID){
    await postDeployment(PREVIOUS);
    if(await activeId()!==PREVIOUS)throw Error("ROLLBACK_DEPLOYMENT_NOT_CONFIRMED");
    console.log("RECOVERED: Worker traffic restored to previous v85.");
   }else console.log("ROLLBACK_SKIPPED: current traffic is not the candidate; manual review needed.");
  }catch(rollbackError){
   console.error("URGENT_REVIEW_REQUIRED: "+String(rollbackError.message).slice(0,110));
  }
 }
 process.exitCode=3;
}
