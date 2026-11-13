// Read-only migration readiness checks for dedicated Cloudflare KV namespace.
// A successful KV list is provisional: KV is eventually consistent and NOT an atomic lock.
const RESERVED_PREFIXES=["draft-revision-v1/","private-kv/","merge-receipt-v1/"];
const LEGACY_KEYS=new Set(["content-draft-v1"]);
export async function auditPrivateNamespace(env){
  const kv=env?.PRIVATE_DRAFT_KV;
  if(!kv||typeof kv.list!=="function"||typeof kv.get!=="function")
    throw Error("PRIVATE_NAMESPACE_UNAVAILABLE");
  const page=await kv.list({limit:100});
  if(!page||!Array.isArray(page.keys)||typeof page.list_complete!=="boolean"||
     page.keys.length>100||page.list_complete!==true)
    throw Error("PRIVATE_NAMESPACE_INVENTORY_INCOMPLETE");
  // This namespace is dedicated: never migrate into unknown/occupied storage.
  const names=page.keys.map(x=>x?.name);
  if(names.some(x=>typeof x!=="string"||x.length===0))
    throw Error("PRIVATE_NAMESPACE_INVENTORY_INVALID");
  if(names.length>0){
    return {ready:false,reason:"PRIVATE_NAMESPACE_NOT_EMPTY",
      entries:names.length,
      hasKnownKeys:names.some(name=>RESERVED_PREFIXES.some(p=>name.startsWith(p))||LEGACY_KEYS.has(name)),
      performedWrites:false};
  }
  // Read-after-list is NOT a transaction; this is advisory only.
  return {ready:true,reason:"EMPTY_AT_AUDIT_TIME",entries:0,performedWrites:false,
    guaranteesExclusiveAccess:false,guaranteesGlobalConsistency:false};
}
