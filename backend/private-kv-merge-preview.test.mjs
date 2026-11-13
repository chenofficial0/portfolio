import assert from "node:assert/strict";
import {previewConflictResolution} from "./src/private-kv-merge-preview.js";
const validate=v=>!!v&&typeof v==="object"&&Array.isArray(v.works)&&!!v.about&&!!v.profile;
const original={about:{bio:"Before",location:"Taiwan"},profile:{photo:"photo-a.jpg"},works:[{title:"Film"}],gallery:[]};
const desktop=structuredClone(original),mobile=structuredClone(original);
desktop.about.bio="Desktop edit";
mobile.about.location="Taichung";
let result=previewConflictResolution(original,desktop,mobile,{},validate);
assert.equal(result.ready,true);
assert.equal(result.merged.about.bio,"Desktop edit");
assert.equal(result.merged.about.location,"Taichung");
assert.equal(result.persisted,false);assert.equal(result.published,false);
assert.equal(original.about.bio,"Before");

mobile.about.bio="Phone edit";
result=previewConflictResolution(original,desktop,mobile,{},validate);
assert.equal(result.ready,false);
assert.deepEqual(result.unresolved,["/about/bio"]);
assert.equal(result.merged,null);
result=previewConflictResolution(original,desktop,mobile,{"/about/bio":"left"},validate);
assert.equal(result.ready,true);
assert.equal(result.merged.about.bio,"Desktop edit");
assert.equal(result.merged.about.location,"Taichung");
result=previewConflictResolution(original,desktop,mobile,{"/about/bio":"right"},validate);
assert.equal(result.merged.about.bio,"Phone edit");
await assert.rejects(async()=>previewConflictResolution(original,desktop,mobile,{"/about/photo":"left"},validate),/INVALID_MERGE_DECISION/);
assert.throws(()=>previewConflictResolution(original,desktop,mobile,{"/about/bio":"base"},validate),/INVALID_MERGE_DECISION/);
assert.throws(()=>previewConflictResolution(original,desktop,mobile,{"/about/bio":"left"},()=>false),/MERGE_RESULT_INVALID/);

const leftDelete=structuredClone(original),rightChange=structuredClone(original);
delete leftDelete.profile.photo;
rightChange.profile.photo="other.jpg";
assert.equal(previewConflictResolution(original,leftDelete,rightChange,{"/profile/photo":"left"},validate).merged.profile.photo,undefined);
assert.equal(previewConflictResolution(original,leftDelete,rightChange,{"/profile/photo":"right"},validate).merged.profile.photo,"other.jpg");

const leftArray=structuredClone(original),rightArray=structuredClone(original);
leftArray.works.push({title:"First"});
rightArray.works.push({title:"Second"});
assert.deepEqual(previewConflictResolution(original,leftArray,rightArray,{"/works":"left"},validate).merged.works,leftArray.works);
assert.deepEqual(original.works,[{title:"Film"}]);

const leftField=structuredClone(original),rightField=structuredClone(original);
leftField.about["a/b"]="left";rightField.about["a/b"]="right";
assert.equal(previewConflictResolution(original,leftField,rightField,{"/about/a~1b":"right"},validate).merged.about["a/b"],"right");

console.log("PASS: merge preview preserves inputs, blocks unresolved conflicts and requires explicit selection for photos and arrays.");
