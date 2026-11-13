// Bounded, authenticated caller-only listing of immutable draft revisions.
// This is an index view, not an authoritative latest-version pointer.
// KV may temporarily omit recent writes in other regions.
import {readRevision,validRevisionId,REVISION_PREFIX} from "./private-kv-revisions.js";

const PAGE_SIZE=30;
const CURSOR_RE=/^[A-Za-z0-9_+=\/-]{1,512}$/;

export async function listDraftRevisions(env,{cursor=null,validate}={}){
  const kv=env?.PRIVATE_DRAFT_KV;
  if(!kv||typeof kv.list!=="function"||typeof kv.get!=="function")throw Error("REVISION_LIST_STORAGE_UNAVAILABLE");
  if(cursor!==null&&(typeof cursor!=="string"||!CURSOR_RE.test(cursor)))throw Error("INVALID_REVISION_CURSOR");
  const listing=await kv.list({prefix:REVISION_PREFIX,limit:PAGE_SIZE,...(cursor?{cursor}:{})});
  if(!listing||!Array.isArray(listing.keys)||typeof listing.list_complete!=="boolean"||
    listing.keys.length>PAGE_SIZE)throw Error("REVISION_LIST_INVALID");
  if(!listing.list_complete&&(!listing.cursor||!CURSOR_RE.test(listing.cursor)||listing.cursor===cursor))
    throw Error("REVISION_LIST_INVALID");
  const ids=listing.keys.map(entry=>{
    const key=entry?.name;
    if(typeof key!=="string"||!key.startsWith(REVISION_PREFIX))throw Error("REVISION_LIST_INVALID");
    const id=key.slice(REVISION_PREFIX.length);
    if(!validRevisionId(id))throw Error("REVISION_LIST_INVALID");
    return id;
  });
  if(new Set(ids).size!==ids.length)throw Error("REVISION_LIST_INVALID");
  const records=await Promise.all(ids.map(id=>readRevision(env,id,{validate})));
  if(records.some(record=>!record))throw Error("REVISION_LIST_STALE");
  return {
    revisions:records.map(({id,parentId,sha,createdAt})=>({id,parentId,sha,createdAt})),
    nextCursor:listing.list_complete?null:listing.cursor,
    complete:listing.list_complete,
    note:"This list may lag across Cloudflare regions. It does not identify an authoritative latest revision."
  };
}
