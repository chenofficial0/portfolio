// Immutable private-draft revision journal for CHEN. Content Studio.
// Development-only: never enable without tested UI selection and reconciliation.
// No "latest" pointer is maintained: KV list/get are eventually consistent.
const PREFIX = "draft-revision-v1/";
const MAX_BYTES = 192 * 1024;
const VALID_ID = /^[A-Za-z0-9_-]{32,64}$/;
const encoder = new TextEncoder();

function store(env,requireWrite=false) {
  const kv=env?.PRIVATE_DRAFT_KV;
  return kv && typeof kv.get==="function" &&
    (!requireWrite || typeof kv.put==="function") ? kv : null;
}
function randomId() {
  const bytes=crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function hash(text) {
  const digest=await crypto.subtle.digest("SHA-256",encoder.encode(text));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export function validRevisionId(id) {
  return typeof id==="string" && VALID_ID.test(id);
}
export async function readRevision(env,id,{validate}={}) {
  const kv=store(env);
  if(!kv)throw Error("REVISION_STORE_UNAVAILABLE");
  if(!validRevisionId(id))throw Error("INVALID_REVISION_ID");
  const raw=await kv.get(PREFIX+id);
  if(raw===null)return null;
  if(typeof raw!=="string" || encoder.encode(raw).length>MAX_BYTES+2048)
    throw Error("REVISION_CORRUPT");
  let record;
  try{record=JSON.parse(raw)}catch{throw Error("REVISION_CORRUPT")}
  if(!record||record.schema!==1||record.id!==id ||
    !validRevisionId(record.parentId) && record.parentId!==null ||
    !/^[a-f0-9]{64}$/.test(record.sha||"") ||
    typeof record.data!=="object" || record.data===null ||
    (record.mergeSources!==undefined&&(!record.mergeSources ||
      typeof record.mergeSources!=="object"||
      !validRevisionId(record.mergeSources.left)||
      !validRevisionId(record.mergeSources.right)||
      record.mergeSources.left===record.mergeSources.right ||
      record.mergeSources.left===record.parentId||
      record.mergeSources.right===record.parentId)))
    throw Error("REVISION_CORRUPT");
  const canonical=JSON.stringify(record.data);
  if(await hash(canonical)!==record.sha)throw Error("REVISION_CORRUPT");
  if(typeof validate==="function"&&!validate(record.data))throw Error("REVISION_INVALID");
  return record;
}
export async function appendRevision(env,{data,parentId=null,validate,mergeSources=null}) {
  const kv=store(env,true);
  if(!kv)throw Error("REVISION_STORE_UNAVAILABLE");
  if(typeof validate!=="function"||!validate(data))throw Error("REVISION_INVALID");
  if(parentId!==null&&!validRevisionId(parentId))throw Error("INVALID_PARENT_REVISION");
  if(mergeSources!==null&&(
    !mergeSources||typeof mergeSources!=="object"||Array.isArray(mergeSources)||
    !validRevisionId(mergeSources.left)||!validRevisionId(mergeSources.right)||
    mergeSources.left===mergeSources.right||mergeSources.left===parentId||
    mergeSources.right===parentId||parentId===null))
    throw Error("INVALID_MERGE_SOURCES");
  const canonical=JSON.stringify(data);
  if(encoder.encode(canonical).length>MAX_BYTES)throw Error("REVISION_TOO_LARGE");
  if(parentId!==null) {
    const parent=await readRevision(env,parentId,{validate});
    if(!parent)throw Error("PARENT_REVISION_UNAVAILABLE");
  }
  const id=randomId();
  // Cryptographically random keys avoid writer collisions; existing entries are never mutated.
  // KV does NOT ensure atomic uniqueness or instant cross-region visibility.
  if(await kv.get(PREFIX+id)!==null)throw Error("REVISION_COLLISION");
  const record={
    schema:1,id,parentId,sha:await hash(canonical),createdAt:new Date().toISOString(),data,
    ...(mergeSources?{mergeSources:{left:mergeSources.left,right:mergeSources.right}}:{})
  };
  await kv.put(PREFIX+id,JSON.stringify(record));
  return {id,parentId,sha:record.sha,createdAt:record.createdAt,immutable:true};
}
export const REVISION_PREFIX=PREFIX;
