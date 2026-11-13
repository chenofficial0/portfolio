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
// Retry receipts reduce duplicate saves after a lost response. KV consistency is eventual:
// these are best-effort checks, NOT transactional exactly-once guarantees.
const RECEIPT_PREFIX="merge-receipt-v1/";
async function existingMergeReceipt(env,digest,validate,resolved){
  const kv=env?.PRIVATE_DRAFT_KV;
  if(!kv||typeof kv.get!=="function")throw Error("MERGE_RECEIPT_STORAGE_UNAVAILABLE");
  const raw=await kv.get(RECEIPT_PREFIX+digest);
  if(raw===null)return null;
  let receipt;
  try{receipt=JSON.parse(raw)}catch{throw Error("MERGE_RECEIPT_CORRUPT")}
  if(!receipt||receipt.digest!==digest||!validRevisionId(receipt.revisionId))
    throw Error("MERGE_RECEIPT_CORRUPT");
  const saved=await readRevision(env,receipt.revisionId,{validate});
  if(!saved||saved.parentId!==resolved.base.id||
     saved.mergeSources?.left!==resolved.left.id||saved.mergeSources?.right!==resolved.right.id||
     JSON.stringify(saved.data)!==JSON.stringify(resolved.preview.merged))
    throw Error("MERGE_RECEIPT_UNVERIFIED");
  return {
    ok:true,revision:{id:saved.id,parentId:saved.parentId,sha:saved.sha,createdAt:saved.createdAt,immutable:true},
    mergedFrom:{base:resolved.base.id,left:resolved.left.id,right:resolved.right.id},
    originalRevisionsPreserved:true,published:false,alreadySaved:true
  };
}
export async function saveReviewedMerge(env,input,validate){
  if(!validMergeSelection(input)||input.confirmation!=="SAVE_MERGE_AS_NEW_REVISION"||
     typeof input.previewDigest!=="string"||!/^[a-f0-9]{64}$/.test(input.previewDigest))
    throw Error("MERGE_CONFIRMATION_REQUIRED");
  const resolved=await resolveSelectedMerge(env,input,validate);
  if(!resolved.preview.ready)throw Error("MERGE_CONFLICTS_UNRESOLVED");
  if(resolved.digest!==input.previewDigest)throw Error("MERGE_PREVIEW_CHANGED");
  const prior=await existingMergeReceipt(env,resolved.digest,validate,resolved);
  if(prior)return prior;
  const kv=env?.PRIVATE_DRAFT_KV;
  if(!kv||typeof kv.put!=="function")throw Error("MERGE_RECEIPT_STORAGE_UNAVAILABLE");
  const revision=await appendRevision(env,{
    data:resolved.preview.merged,parentId:resolved.base.id,validate,
    mergeSources:{left:resolved.left.id,right:resolved.right.id}
  });
  // A failed receipt write must be reported as uncertain. The revision may exist:
  // never silently claim that a retry is guaranteed to be deduplicated.
  await kv.put(RECEIPT_PREFIX+resolved.digest,JSON.stringify({
    digest:resolved.digest,revisionId:revision.id
  }));
  return {ok:true,revision,mergedFrom:{
    base:resolved.base.id,left:resolved.left.id,right:resolved.right.id},
    originalRevisionsPreserved:true,published:false,alreadySaved:false
  };
}
