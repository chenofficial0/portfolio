// CHEN. Cloudflare post-migration audit — strictly GET, no writes or deployment.
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {EXPECTED_PUBLIC_ASSETS,buildPrivateMigrationBundle}
 from "./src/private-kv-migration-bundle.js";
import {auditCloudflareNamespace} from "./src/cloudflare-remote-kv-audit.js";

const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN=process.env.CLOUDFLARE_KV_READ_TOKEN;
const NS="aad4672cc5474625b8fc0f070e75bc99";
const ROOT_ID="DHHWj72Rf_MotkHDt7jdKSAEyhwIeUDO";
const ROOT_KEY="draft-revision-v1/"+ROOT_ID;
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const endpoint=relative=>"https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+
 "/storage/kv/namespaces/"+NS+relative;
async function getBytes(key){
 const response=await fetch(endpoint("/values/"+encodeURIComponent(key)),{
  method:"GET",headers:{Authorization:"Bearer "+TOKEN},
  signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error("READBACK_HTTP_"+response.status);
 return Buffer.from(await response.arrayBuffer());
}
async function getMetadata(key){
 const response=await fetch(endpoint("/metadata/"+encodeURIComponent(key)),{
  method:"GET",headers:{Authorization:"Bearer "+TOKEN},
  signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error("READBACK_METADATA_HTTP_"+response.status);
 const body=await response.json();
 if(body.success!==true)throw Error("READBACK_METADATA_UNVERIFIED");
 return body.result;
}
async function list(){
 const response=await fetch(endpoint("/keys?limit=100"),{
  method:"GET",headers:{Authorization:"Bearer "+TOKEN},
  signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error("LIST_HTTP_"+response.status);
 const body=await response.json();
 if(body.success!==true||!Array.isArray(body.result)||body.result_info?.cursor)
  throw Error("INVENTORY_NOT_COMPLETE");
 return body.result.map(x=>x.name).sort();
}
async function main(){
 if(!TOKEN||!ACCOUNT||!/^[a-f0-9]{32}$/.test(ACCOUNT))
  throw Error("MISSING_READ_ONLY_CREDENTIALS");
 const expected=new Set([ROOT_KEY,...EXPECTED_PUBLIC_ASSETS.map(x=>x.path.replace("assets/uploads/","private-kv/"))]);
 const names=await list();
 if(names.length!==expected.size||names.some(x=>!expected.has(x)))
  throw Error("MIGRATION_NAMESPACE_CONTENTS_DIFFER");
 const source=JSON.parse(await readFile(path.join(ROOT,"content/site.json"),"utf8"));
 const files=Object.fromEntries(await Promise.all(EXPECTED_PUBLIC_ASSETS.map(async spec=>[
  spec.path,await readFile(path.join(ROOT,spec.path))
 ])));
 const expectedBundle=buildPrivateMigrationBundle(source,files,{id:ROOT_ID});
 for(const asset of expectedBundle.media){
  const remote=await getBytes(asset.key);
  if(sha256(remote)!==asset.sha256||remote.length!==asset.bytes.length)
    throw Error("REMOTE_PRIVATE_MEDIA_HASH_MISMATCH");
  const meta=await getMetadata(asset.key);
  if(meta?.bytes!==asset.metadata.bytes||meta?.kind!=="private-media-v1")
    throw Error("REMOTE_PRIVATE_MEDIA_METADATA_MISMATCH");
 }
 const stored=JSON.parse((await getBytes(ROOT_KEY)).toString("utf8"));
 if(stored.id!==ROOT_ID||stored.parentId!==null||
    stored.sha!==expectedBundle.record.sha||
    sha256(JSON.stringify(stored.data))!==expectedBundle.record.sha)
  throw Error("REMOTE_PRIVATE_DRAFT_CONTENT_MISMATCH");
 console.log("PASS: read-only second verification found exactly three expected KV keys.");
 console.log("PASS: both original media hashes and metadata match byte-for-byte.");
 console.log("PASS: immutable root draft matches the source snapshot and private media paths.");
 console.log("No live publish, overwrite, upload, or delete occurred.");
}
main().catch(e=>{console.error("BLOCKED: "+String(e.message).slice(0,100));process.exitCode=5});
