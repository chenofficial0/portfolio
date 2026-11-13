// Pure, read-only three-way comparison for CHEN. immutable draft revisions.
// This module never writes, merges, deletes or publishes content.
const MAX_CHANGES = 300;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const plain = v => v !== null && typeof v === "object" && !Array.isArray(v);
const escapePointer = key => key.replace(/~/g, "~0").replace(/\//g, "~1");
const displayPath = parts => parts.length ? "/" + parts.map(escapePointer).join("/") : "/";

function equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) &&
      a.length === b.length && a.every((value, i) => equal(value, b[i]));
  }
  if (plain(a) || plain(b)) {
    if (!plain(a) || !plain(b)) return false;
    const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
    return ak.length === bk.length && ak.every((key, i) =>
      key === bk[i] && equal(a[key], b[key]));
  }
  return false;
}
function classify(base, left, right) {
  const l = !equal(base, left);
  const r = !equal(base, right);
  if (!l && !r) return null;
  if (l && r) return equal(left, right) ? "same-change" : "conflict";
  return l ? "left-only" : "right-only";
}
function kind(v) {
  if (v === undefined) return "absent";
  if (Array.isArray(v)) return "array";
  if (v === null) return "null";
  return typeof v;
}
function preview(v) {
  if (v === undefined) return {present:false};
  if (Array.isArray(v)) return {present:true,type:"array",items:v.length};
  if (plain(v)) return {present:true,type:"object",fields:Object.keys(v).length};
  if (typeof v === "string") return {
    present:true,type:"string",text:v.length > 240 ? v.slice(0,240) + "…" : v,
    truncated:v.length > 240
  };
  return {present:true,type:kind(v),value:v};
}
export function compareThreeWay(base,left,right) {
  if (![base,left,right].every(plain)) throw Error("INVALID_COMPARISON_INPUT");
  const changes = [];
  const summary = {"left-only":0,"right-only":0,"same-change":0,conflict:0};
  function visit(b,l,r,parts) {
    // Nested JSON objects are traversed; arrays are treated atomically to avoid
    // index-based accidental merging when photos or filmography items reorder.
    if (plain(b) && plain(l) && plain(r)) {
      const keys = [...new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])].sort();
      for(const key of keys) {
        if (FORBIDDEN_KEYS.has(key)) throw Error("UNSAFE_FIELD_NAME");
        visit(b[key],l[key],r[key],[...parts,key]);
      }
      return;
    }
    const status=classify(b,l,r);
    if(!status)return;
    if(changes.length>=MAX_CHANGES)throw Error("TOO_MANY_COMPARISON_CHANGES");
    summary[status]++;
    changes.push({path:displayPath(parts),status,
      before:preview(b),left:preview(l),right:preview(r)});
  }
  visit(base,left,right,[]);
  return {changes,summary,hasConflicts:summary.conflict>0,automaticMergePerformed:false};
}
