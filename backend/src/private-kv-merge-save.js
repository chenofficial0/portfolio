// CHEN. Reviewed merge save. Creates an immutable NEW revision only.
// Never updates a selected revision or publishes content to the website.
import {appendRevision,readRevision,validRevisionId} from "./private-kv-revisions.js";
import {previewConflictResolution} from "./private-kv-merge-preview.js";
const encoder=new TextEncoder();

export async function mergePreviewDigest(input){
  const bytes=encoder.encode(JSON.stringify(input));
  const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
  return [...hash].map(n=>n.toString(16).padStart(2,"0")).join("");
}
export function validMergeSelection(input){
  return !!input&&typeof input==="object"&&!Array.isArray(input)&&
    [input.base,input.left,input.right].every(validRevisionId)&&
    new Set([input.base,input.left,input.right]).size===3&&
    !!input.decisions&&typeof input.decisions==="object"&&!Array.isArray(input.decisions);
}
export async function resolveSelectedMerge(env,input,validate){
  if(!validMergeSelection(input))throw Error("INVALID_MERGE_SELECTION");
  const revisions=await Promise.all([input.base,input.left,input.right].map(
    id=>readRevision(env,id,{validate})));
  if(revisions.some(revision=>!revision))throw Error("MERGE_SOURCE_NOT_FOUND");
  const [base,left,right]=revisions;
  if(left.parentId!==base.id||right.parentId!==base.id)throw Error("MERGE_UNRELATED_REVISIONS");
  const preview=previewConflictResolution(base.data,left.data,right.data,input.decisions,validate);
  const digest=preview.ready?await mergePreviewDigest({
    base:base.id,left:left.id,right:right.id,decisions:input.decisions,merged:preview.merged
  }):null;
  return {preview,digest,base,left,right};
}
export async function saveReviewedMerge(env,input,validate){
  if(!validMergeSelection(input)||input.confirmation!=="SAVE_MERGE_AS_NEW_REVISION"||
     typeof input.previewDigest!=="string"||!/^[a-f0-9]{64}$/.test(input.previewDigest))
    throw Error("MERGE_CONFIRMATION_REQUIRED");
  const resolved=await resolveSelectedMerge(env,input,validate);
  if(!resolved.preview.ready)throw Error("MERGE_CONFLICTS_UNRESOLVED");
  if(resolved.digest!==input.previewDigest)throw Error("MERGE_PREVIEW_CHANGED");
  const revision=await appendRevision(env,{
    data:resolved.preview.merged,parentId:resolved.base.id,validate,
    mergeSources:{left:resolved.left.id,right:resolved.right.id}
  });
  return {ok:true,revision,mergedFrom:{
    base:resolved.base.id,left:resolved.left.id,right:resolved.right.id},
    originalRevisionsPreserved:true,published:false
  };
}
