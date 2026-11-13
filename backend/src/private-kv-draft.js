// CHEN. Private content staging on Cloudflare Workers KV (development only).
// No auto-migration or public GitHub write. Caller must authenticate and check Origin/CSRF.
// KV is eventually consistent and has no compare-and-swap. Revisions are advisory:
// concurrent writes can race, so this is NOT an atomic conflict-prevention mechanism.
const DRAFT_KEY="content-draft-v1";
const MAX_DRAFT_BYTES=192*1024;
const encoder=new TextEncoder();
function kv(env){
  const store=env?.PRIVATE_DRAFT_KV;
  return store&&typeof store.get==="function"&&typeof store.put==="function"?store:null;
}
async function digest(content){
  const hash=await crypto.subtle.digest("SHA-256",encoder.encode(content));
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export async function readPrivateDraft(env){
  const store=kv(env);
  if(!store)throw Error("PRIVATE_DRAFT_STORAGE_UNAVAILABLE");
  const raw=await store.get(DRAFT_KEY);
  if(raw===null)return null;
  if(typeof raw!=="string"||encoder.encode(raw).length>MAX_DRAFT_BYTES+2048)
    throw Error("PRIVATE_DRAFT_CORRUPT");
  let parsed;
  try{parsed=JSON.parse(raw)}catch{throw Error("PRIVATE_DRAFT_CORRUPT")}
  if(!parsed||parsed.schema!==1||!parsed.data||typeof parsed.data!=="object"||
      typeof parsed.version!=="string"||!/^[a-f0-9]{64}$/.test(parsed.version))
    throw Error("PRIVATE_DRAFT_CORRUPT");
  if(await digest(JSON.stringify(parsed.data))!==parsed.version)throw Error("PRIVATE_DRAFT_CORRUPT");
  return {data:parsed.data,sha:parsed.version,updatedAt:parsed.updatedAt,private:true};
}
export async function writePrivateDraft(env,{data,expectedSha,validate}){
  const store=kv(env);
  if(!store)throw Error("PRIVATE_DRAFT_STORAGE_UNAVAILABLE");
  if(typeof validate!=="function"||!validate(data))throw Error("PRIVATE_DRAFT_INVALID");
  const serialized=JSON.stringify(data);
  if(encoder.encode(serialized).length>MAX_DRAFT_BYTES)throw Error("PRIVATE_DRAFT_TOO_LARGE");
  const current=await readPrivateDraft(env);
  if(current){
    if(expectedSha!==current.sha)throw Error("PRIVATE_DRAFT_STALE");
  }else if(expectedSha!==null)throw Error("PRIVATE_DRAFT_STALE");
  const version=await digest(serialized);
  const updatedAt=new Date().toISOString();
  await store.put(DRAFT_KEY,JSON.stringify({schema:1,version,updatedAt,data}));
  return {ok:true,sha:version,updatedAt,private:true};
}
export async function initializePrivateDraft(env,{data,validate}){
  // Explicit migration only. Never overwrite a preexisting private draft.
  return writePrivateDraft(env,{data,expectedSha:null,validate});
}
export const PRIVATE_DRAFT_KEY=DRAFT_KEY;
export const PRIVATE_DRAFT_MAX_BYTES=MAX_DRAFT_BYTES;
