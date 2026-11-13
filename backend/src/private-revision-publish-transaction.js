// CHEN. Approved publication transaction core (adapter-only, never called by Worker routes).
// All operations are isolated to the GitHub adapter supplied by a trusted, separately reviewed caller.
// No production route or automatic deployment uses this module.
import {planPrivateRevisionPublish} from "./private-revision-publish-plan.js";
const HEX=/^[a-f0-9]{40}$/;
const D64=/^[a-f0-9]{64}$/;
const encode=new TextEncoder();
const bytesOf=x=>x instanceof Uint8Array?x:new Uint8Array(x);
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,"0")).join("");
async function gitBlobHash(value){
 const bytes=bytesOf(value);
 const head=encode.encode("blob "+bytes.length+"\0");
 const all=new Uint8Array(head.length+bytes.length);
 all.set(head);all.set(bytes,head.length);
 return hex(new Uint8Array(await crypto.subtle.digest("SHA-1",all)));
}
function validAsset(path,bytes){
 const data=bytesOf(bytes);
 if(data.length<100||data.length>1048576)throw Error("RELEASE_MEDIA_SIZE_UNSAFE");
 if(path.endsWith(".jpg")){
   if(data[0]!==255||data[1]!==216||data.at(-2)!==255||data.at(-1)!==217)
    throw Error("RELEASE_MEDIA_SIGNATURE_INVALID");
 }else if(path.endsWith(".png")){
   if([137,80,78,71,13,10,26,10].some((x,i)=>data[i]!==x))
    throw Error("RELEASE_MEDIA_SIGNATURE_INVALID");
 }else if(path.endsWith(".pdf")){
   if(String.fromCharCode(...data.slice(0,5))!=="%PDF-")
    throw Error("RELEASE_MEDIA_SIGNATURE_INVALID");
 }else throw Error("RELEASE_MEDIA_TYPE_INVALID");
 return data;
}
function ensureAdapter(adapter){
 for(const method of ["getMainSha","getMainTreeSha","getPathSha","createBlob","createTree","createCommit","updateMainRef"])
   if(typeof adapter?.[method]!=="function")throw Error("RELEASE_ADAPTER_UNAVAILABLE");
}
function checkedSha(sha){
 if(typeof sha!=="string"||!HEX.test(sha))throw Error("RELEASE_GIT_SHA_INVALID");
 return sha;
}
export async function prepareApprovedRelease({revisionId,data,liveData,validate,
  expectedSourceDigest,expectedPublishedDigest,expectedMainSha,
  confirmation,adapter,loadPrivateMedia}){
 if(confirmation!=="PUBLISH_APPROVED_PRIVATE_REVISION")
  throw Error("RELEASE_EXPLICIT_CONFIRMATION_REQUIRED");
 if(!D64.test(expectedSourceDigest||"")||!D64.test(expectedPublishedDigest||""))
  throw Error("RELEASE_PREVIEW_DIGEST_INVALID");
 checkedSha(expectedMainSha);
 ensureAdapter(adapter);
 if(typeof loadPrivateMedia!=="function")throw Error("RELEASE_PRIVATE_MEDIA_UNAVAILABLE");
 const plan=await planPrivateRevisionPublish({revisionId,data,liveData,validate});
 if(plan.sourceDigest!==expectedSourceDigest||plan.publishedDigest!==expectedPublishedDigest)
  throw Error("RELEASE_REVIEW_CHANGED");
 // Check the public branch HEAD before any Git objects are created.
 if(await adapter.getMainSha()!==expectedMainSha)throw Error("RELEASE_MAIN_CHANGED");
 const baseTreeSha=checkedSha(await adapter.getMainTreeSha(expectedMainSha));
 const changes=[];
 for(const entry of plan.media){
   const original=await loadPrivateMedia(entry.source);
   if(!original)throw Error("RELEASE_MEDIA_MISSING");
   const file=validAsset(entry.publicPath,original.bytes);
   const hash=await gitBlobHash(file);
   const existing=await adapter.getPathSha(expectedMainSha,entry.publicPath);
   if(existing!==null&&existing!==undefined){
     if(checkedSha(existing)!==hash)throw Error("RELEASE_MEDIA_PUBLIC_COLLISION");
     // An identical public asset already exists; never overwrite or re-upload.
   }else{
     const created=checkedSha(await adapter.createBlob(file,"base64"));
     if(created!==hash)throw Error("RELEASE_MEDIA_BLOB_MISMATCH");
     changes.push({path:entry.publicPath,mode:"100644",type:"blob",sha:created});
   }
 }
 const jsonText=JSON.stringify(plan.publicData,null,2)+"\n";
 const contentBlobSha=checkedSha(await adapter.createBlob(encode.encode(jsonText),"utf-8"));
 changes.unshift({path:"content/site.json",mode:"100644",type:"blob",sha:contentBlobSha});
 const treeSha=checkedSha(await adapter.createTree(baseTreeSha,changes));
 const commitSha=checkedSha(await adapter.createCommit({
   parentSha:expectedMainSha,treeSha,message:"Publish reviewed CHEN private revision "+revisionId
 }));
 // Recheck immediately before the sole branch write; GitHub must reject non-fast-forward.
 if(await adapter.getMainSha()!==expectedMainSha)
  throw Error("RELEASE_MAIN_CHANGED_BEFORE_REF_UPDATE");
 try{
   await adapter.updateMainRef(commitSha,{force:false});
 }catch(_){
   // Commit and blobs may be orphaned. Never retry without checking the branch.
   throw Error("RELEASE_REF_UPDATE_UNCERTAIN");
 }
 return {published:true,commitSha,parentSha:expectedMainSha,previousTreeSha:baseTreeSha,
   revisionId,mediaFiles:plan.media.length,publicContentSha:contentBlobSha};
}
export async function prepareRollback({publication,confirmation,adapter}){
 if(confirmation!=="RESTORE_PREVIOUS_PUBLIC_SITE")throw Error("ROLLBACK_CONFIRMATION_REQUIRED");
 ensureAdapter(adapter);
 const published=checkedSha(publication?.commitSha);
 const previousTree=checkedSha(publication?.previousTreeSha);
 if(await adapter.getMainSha()!==published)throw Error("ROLLBACK_MAIN_CHANGED");
 // Restore old tree by adding a new commit. Never rewrite or force-push Git history.
 const rollbackSha=checkedSha(await adapter.createCommit({
  parentSha:published,treeSha:previousTree,message:"Restore previous CHEN public site"
 }));
 if(await adapter.getMainSha()!==published)throw Error("ROLLBACK_MAIN_CHANGED_BEFORE_REF_UPDATE");
 try{await adapter.updateMainRef(rollbackSha,{force:false})}
 catch(_){throw Error("ROLLBACK_REF_UPDATE_UNCERTAIN")}
 return {restored:true,rollbackSha,restoredTreeSha:previousTree,
  historicalMediaMayRemainPublic:true};
}
