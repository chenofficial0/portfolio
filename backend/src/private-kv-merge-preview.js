// CHEN. Pure conflict resolution preview: no persistence, publish, or deletion.
import {compareThreeWay} from "./private-kv-compare.js";

const FORBIDDEN=new Set(["__proto__","prototype","constructor"]);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));

function segments(path){
  if(typeof path!=="string"||!path.startsWith("/")||path==="/")throw Error("INVALID_MERGE_PATH");
  const parts=path.slice(1).split("/").map(x=>{
    if(/~(?![01])/.test(x))throw Error("INVALID_MERGE_PATH");
    const key=x.replace(/~1/g,"/").replace(/~0/g,"~");
    if(!key||FORBIDDEN.has(key))throw Error("INVALID_MERGE_PATH");
    return key;
  });
  return parts;
}
function pick(source,keys){
  let current=source;
  for(const key of keys){
    if(current===null||typeof current!=="object"||Array.isArray(current)||!own(current,key))
      return {exists:false};
    current=current[key];
  }
  return {exists:true,value:current};
}
function apply(target,keys,selected){
  let parent=target;
  for(const key of keys.slice(0,-1)){
    if(parent===null||typeof parent!=="object"||Array.isArray(parent)||!own(parent,key))
      throw Error("INVALID_MERGE_PARENT");
    parent=parent[key];
  }
  if(parent===null||typeof parent!=="object"||Array.isArray(parent))
    throw Error("INVALID_MERGE_PARENT");
  const key=keys.at(-1);
  if(selected.exists)parent[key]=clone(selected.value);
  else delete parent[key];
}

export function previewConflictResolution(base,left,right,decisions={},validate){
  if(!decisions||typeof decisions!=="object"||Array.isArray(decisions))
    throw Error("INVALID_MERGE_DECISIONS");
  const comparison=compareThreeWay(base,left,right);
  const conflicts=comparison.changes.filter(c=>c.status==="conflict");
  if(conflicts.length>0&&typeof validate!=="function")throw Error("MISSING_OUTPUT_VALIDATOR");
  const wanted=new Set(conflicts.map(c=>c.path));
  for(const [path,side] of Object.entries(decisions)){
    if(!wanted.has(path)||!["left","right"].includes(side))throw Error("INVALID_MERGE_DECISION");
  }
  const unresolved=conflicts.filter(c=>!own(decisions,c.path)).map(c=>c.path);
  if(unresolved.length)return {
    ready:false,unresolved,summary:comparison.summary,merged:null,
    persisted:false,published:false
  };
  const merged=clone(base);
  for(const change of comparison.changes){
    const side=change.status==="right-only"?"right":
      change.status==="conflict"?decisions[change.path]:"left";
    const selected=pick(side==="left"?left:right,segments(change.path));
    apply(merged,segments(change.path),selected);
  }
  if(typeof validate==="function"&&!validate(merged))throw Error("MERGE_RESULT_INVALID");
  return {ready:true,unresolved:[],summary:comparison.summary,merged,
    persisted:false,published:false};
}
