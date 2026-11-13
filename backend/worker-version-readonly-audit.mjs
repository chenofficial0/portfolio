// Read-only account-scoped Cloudflare Worker version/deployment verification.
// No Worker code or KV reads, writes, deployments, deletes or token logging.
const TOKEN=process.env.CLOUDFLARE_WORKER_EDITOR_TOKEN;
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID;
const SCRIPT="chen-content-studio-api";
if(!TOKEN||!ACCOUNT||!/^[a-f0-9]{32}$/.test(ACCOUNT)){
  console.error("BLOCKED: scoped Worker audit credentials unavailable.");
  process.exitCode=2;
}else{
  async function api(path){
    const response=await fetch("https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+
      "/workers/scripts/"+SCRIPT+path,{
      headers:{Authorization:"Bearer "+TOKEN,Accept:"application/json"},
      signal:AbortSignal.timeout(15000)
    });
    if(!response.ok)throw Error("READ_ONLY_WORKER_HTTP_"+response.status);
    const result=await response.json();
    if(result?.success!==true)throw Error("WORKER_AUDIT_API_UNAVAILABLE");
    return result.result;
  }
  try{
    const versions=await api("/versions?per_page=10");
    if(!Array.isArray(versions))throw Error("WORKER_VERSIONS_FORMAT_UNEXPECTED");
    // Cloudflare returns a version list ordered latest-first, not an active deployment.
    const recent=versions.slice(0,5).map(v=>({
      id:typeof v.id==="string"?v.id:"unknown",
      number:v.number??null,
      source:v.metadata?.source??null,
      created:v.metadata?.created_on??null
    }));
    console.log("PASS: scoped token can list Worker versions.");
    console.log("Latest Worker version metadata: "+JSON.stringify(recent));
    const deploymentResult=await api("/deployments");
    const deployments=deploymentResult?.deployments;
    if(!Array.isArray(deployments))throw Error("WORKER_DEPLOYMENTS_FORMAT_UNEXPECTED");
    console.log("PASS: scoped token can read Worker deployments.");
    console.log("Current deployment version IDs: "+JSON.stringify(
      deployments.slice(0,2).map(d=>({id:d.id,created:d.created_on,
        versions:(d.versions||[]).map(v=>({version_id:v.version_id,percentage:v.percentage}))}))
    ));
  }catch(err){
    console.error("BLOCKED: read-only Worker verification: "+String(err.message).slice(0,110));
    process.exitCode=3;
  }
}
