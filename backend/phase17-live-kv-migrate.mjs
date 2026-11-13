// CHEN. One-time, explicitly authorized migration to a dedicated Workers KV namespace.
// NO DELETE, NO deployment, NO publishing, NO changes to source files.
// Only callable when the maintainer explicitly triggers the migration workflow.
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {buildPrivateMigrationBundle,EXPECTED_PUBLIC_ASSETS}
 from "./src/private-kv-migration-bundle.js";
import {auditCloudflareNamespace} from "./src/cloudflare-remote-kv-audit.js";

const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_KV_MIGRATION_TOKEN;
const namespaceId="aad4672cc5474625b8fc0f070e75bc99";
const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
function requireAuth(){
 if(!token||token.length<8||!account||!/^[a-f0-9]{32}$/.test(account))
  throw Error("MIGRATION_CREDENTIALS_NOT_CONFIGURED");
 if(process.env.CHEN_CONFIRM_MIGRATION!=="COPY_TWO_PHOTOS_AND_CREATE_ROOT")
  throw Error("MIGRATION_EXPLICIT_CONFIRMATION_MISSING");
}
const endpoint=key=>"https://api.cloudflare.com/client/v4/accounts/"+account+
 "/storage/kv/namespaces/"+namespaceId+"/values/"+encodeURIComponent(key);
const metaEndpoint=key=>"https://api.cloudflare.com/client/v4/accounts/"+account+
 "/storage/kv/namespaces/"+namespaceId+"/metadata/"+encodeURIComponent(key);
const headers=()=>({Authorization:"Bearer "+token});
async function put(key,bytes,metadata=null){
 const body=new FormData();
 body.append("value",new Blob([bytes],{type:"application/octet-stream"}),"value.bin");
 if(metadata)body.append("metadata",JSON.stringify(metadata));
 const response=await fetch(endpoint(key),{method:"PUT",headers:headers(),body,
  signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error("MIGRATION_PUT_HTTP_"+response.status);
 const result=await response.json();
 if(result?.success!==true)throw Error("MIGRATION_PUT_UNCONFIRMED");
}
async function getRaw(key){
 const response=await fetch(endpoint(key),{method:"GET",headers:headers(),
  signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error("MIGRATION_GET_HTTP_"+response.status);
 return Buffer.from(await response.arrayBuffer());
}
async function verifyMetadata(key,expected){
 const response=await fetch(metaEndpoint(key),{method:"GET",headers:headers(),
  signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error("MIGRATION_METADATA_HTTP_"+response.status);
 const result=await response.json();
 if(result?.success!==true||result.result?.bytes!==expected.bytes||
    result.result?.kind!==expected.kind)
  throw Error("MIGRATION_MEDIA_METADATA_MISMATCH");
}
async function assertLegacyGitSha(buffer){
 const sha=createHash("sha1").update("blob "+buffer.length+"\0").update(buffer).digest("hex");
 if(sha!=="2ab580d05a8d35860cbe478a052409466cdf148c")
  throw Error("STAGED_CONTENT_CHANGED");
 const url="https://api.github.com/repos/chenofficial0/portfolio/git/ref/heads/feature/secure-content-studio-api";
 const ref=await fetch(url,{headers:{Accept:"application/vnd.github+json"},signal:AbortSignal.timeout(15000)});
 if(!ref.ok)throw Error("STAGING_GIT_REF_UNAVAILABLE");
 const body=await ref.json();
 if(!/^[a-f0-9]{40}$/.test(body.object?.sha||""))
  throw Error("STAGING_GIT_REF_INVALID");
 const current=await fetch("https://api.github.com/repos/chenofficial0/portfolio/contents/content/site.json?ref=feature%2Fsecure-content-studio-api",
  {headers:{Accept:"application/vnd.github+json"},signal:AbortSignal.timeout(15000)});
 if(!current.ok)throw Error("STAGING_GIT_CONTENT_UNAVAILABLE");
 const item=await current.json();
 if(item?.sha!==sha)throw Error("STAGING_SOURCE_HAS_CHANGED");
}
try{
 requireAuth();
 const sourceBuffer=await readFile(path.join(repoRoot,"content/site.json"));
 const source=JSON.parse(sourceBuffer.toString("utf8"));
 await assertLegacyGitSha(sourceBuffer);
 const assets=Object.fromEntries(await Promise.all(EXPECTED_PUBLIC_ASSETS.map(async entry=>[
  entry.path,await readFile(path.join(repoRoot,entry.path))
 ])));
 const bundle=buildPrivateMigrationBundle(source,assets);
 const audit=await auditCloudflareNamespace({token,account});
 if(!audit.identityVerified||!audit.readyForControlledMigration)
  throw Error("MIGRATION_NAMESPACE_NOT_VERIFIED_EMPTY");
 console.log("PASS: source and namespace preflight verified; beginning three-key controlled copy.");
 for(const asset of bundle.media){
  await put(asset.key,asset.bytes,asset.metadata);
  const remotelyStored=await getRaw(asset.key);
  const actual=createHash("sha256").update(remotelyStored).digest("hex");
  if(actual!==asset.sha256)throw Error("MIGRATION_IMAGE_READBACK_MISMATCH");
  await verifyMetadata(asset.key,asset.metadata);
  console.log("PASS: private photo copied and read-back verified ("+
    asset.metadata.bytes+" bytes).");
 }
 // Write immutable root ONLY after the photos have been independently verified.
 await put(bundle.recordKey,Buffer.from(bundle.recordText,"utf8"));
 const stored=await getRaw(bundle.recordKey);
 if(createHash("sha256").update(stored).digest("hex")!==
    createHash("sha256").update(bundle.recordText).digest("hex"))
  throw Error("MIGRATION_REVISION_READBACK_MISMATCH");
 console.log("PASS: immutable private root revision copied and verified.");
 console.log("Private root revision ID: "+bundle.record.id);
 console.log("Original public files and GitHub staging content were not modified.");
}catch(error){
 // A partial copy must never be silently retried. It may leave 1–3 private keys.
 console.error("BLOCKED: migration stopped; no cleanup attempted. Cause: "+
  String(error.message||"MIGRATION_UNKNOWN_ERROR").slice(0,100));
 process.exitCode=5;
}
