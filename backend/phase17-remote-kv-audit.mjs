// Phase 17: remote Cloudflare KV audit (read-only REST requests, no deployment).
// Never print secrets, keys, values, URLs carrying credentials, or response bodies.
import assert from "node:assert/strict";

const namespaceId="aad4672cc5474625b8fc0f070e75bc99";
const expectedTitle="CHEN_PRIVATE_DRAFTS";
const token=process.env.CLOUDFLARE_API_TOKEN;
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!token||!account||!/^[a-f0-9]{32}$/.test(account)){
  console.error("BLOCKED: GitHub Secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required.");
  process.exitCode=2;
}else{
  const base="https://api.cloudflare.com/client/v4/accounts/"+account+
    "/storage/kv/namespaces/"+namespaceId;
  async function cfGet(relative){
    const response=await fetch(base+relative,{
      method:"GET",
      headers:{Authorization:"Bearer "+token,Accept:"application/json"},
      signal:AbortSignal.timeout(15000)
    });
    // Never print any Cloudflare response or supplied key metadata.
    if(!response.ok)throw Error("CLOUDFLARE_READ_FAILED_HTTP_"+response.status);
    const body=await response.json();
    if(body?.success!==true)throw Error("CLOUDFLARE_API_REPORTED_FAILURE");
    return body;
  }
  try{
    const detail=await cfGet("");
    assert.equal(detail.result?.id,namespaceId,"NAMESPACE_ID_MISMATCH");
    assert.equal(detail.result?.title,expectedTitle,"NAMESPACE_TITLE_MISMATCH");
    const inventory=await cfGet("/keys?limit=100");
    if(!Array.isArray(inventory.result))throw Error("UNEXPECTED_INVENTORY_FORMAT");
    if(inventory.result.some(record=>!record||typeof record.name!=="string"))
      throw Error("UNEXPECTED_KEY_RECORD_FORMAT");
    const pagesContinue=!!inventory.result_info?.cursor;
    const count=inventory.result.length;
    console.log("PASS: remote Cloudflare namespace identity verified with read-only API token.");
    if(count!==0||pagesContinue){
      console.log("BLOCKED: private namespace is not proven empty; migration requires inventory review.");
      process.exitCode=3;
    }else{
      console.log("PASS: first read-only inventory lists zero keys (not an atomic consistency guarantee).");
    }
  }catch(err){
    console.error("BLOCKED: remote namespace audit could not complete: "+String(err.message).slice(0,100));
    process.exitCode=4;
  }
}
