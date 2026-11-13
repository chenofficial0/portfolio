// Phase 17: remote Cloudflare KV audit (READ-ONLY, no deployment).
// Never print secrets, key names, key values or Cloudflare response bodies.
const ID="aad4672cc5474625b8fc0f070e75bc99";
const TITLE="CHEN_PRIVATE_DRAFTS";

export async function auditCloudflareNamespace({token,account,fetchImpl=fetch}){
  if(typeof token!=="string"||token.length<8||
     typeof account!=="string"||!/^[a-f0-9]{32}$/.test(account))
    throw Error("REMOTE_AUDIT_CREDENTIALS_MISSING");
  const base="https://api.cloudflare.com/client/v4/accounts/"+account+
    "/storage/kv/namespaces/"+ID;
  const read=async(relative)=>{
    const response=await fetchImpl(base+relative,{
      method:"GET",
      headers:{Authorization:"Bearer "+token,Accept:"application/json"},
      signal:AbortSignal.timeout(15000)
    });
    if(!response.ok)throw Error("CLOUDFLARE_READ_FAILED_HTTP_"+response.status);
    const body=await response.json();
    if(body?.success!==true)throw Error("CLOUDFLARE_API_REPORTED_FAILURE");
    return body;
  };
  const detail=await read("");
  if(detail.result?.id!==ID||detail.result?.title!==TITLE)
    throw Error("NAMESPACE_IDENTITY_MISMATCH");
  const inventory=await read("/keys?limit=100");
  if(!Array.isArray(inventory.result)||inventory.result.length>100||
    inventory.result.some(record=>!record||typeof record.name!=="string"))
    throw Error("NAMESPACE_INVENTORY_INVALID");
  const complete=!inventory.result_info?.cursor;
  return {
    identityVerified:true,readOnly:true,entryCount:inventory.result.length,
    readyForControlledMigration:inventory.result.length===0&&complete,
    listingComplete:complete,
    globalConsistencyGuaranteed:false
  };
}
