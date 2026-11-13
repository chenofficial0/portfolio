import assert from "node:assert/strict";
import {compareThreeWay} from "./src/private-kv-compare.js";
const base={about:{bio:"Original",location:"Taiwan"},profile:{photo:"photo-a.jpg"},works:[{title:"First"}],gallery:[]};
const left=structuredClone(base),right=structuredClone(base);
left.about.bio="Desktop bio";
right.about.location="Taichung";
let c=compareThreeWay(base,left,right);
assert.equal(c.hasConflicts,false);
assert.deepEqual(c.summary,{"left-only":1,"right-only":1,"same-change":0,conflict:0});
assert.deepEqual(c.changes.map(x=>x.path),["/about/bio","/about/location"]);
assert.equal(c.automaticMergePerformed,false);

right.about.bio="Phone bio";
c=compareThreeWay(base,left,right);
assert.equal(c.hasConflicts,true);
assert.equal(c.summary.conflict,1);
assert.equal(c.changes.find(x=>x.path==="/about/bio").left.text,"Desktop bio");
assert.equal(c.changes.find(x=>x.path==="/about/bio").right.text,"Phone bio");

right.about.bio="Desktop bio";
c=compareThreeWay(base,left,right);
assert.equal(c.summary["same-change"],1);
assert.equal(c.summary.conflict,0);

const arrayLeft=structuredClone(base),arrayRight=structuredClone(base);
arrayLeft.works.push({title:"New A"});
arrayRight.works.reverse();
c=compareThreeWay(base,arrayLeft,arrayRight);
assert.equal(c.summary["left-only"],1); // a one-item reversal is unchanged
assert.equal(c.changes[0].path,"/works");
arrayRight.works.push({title:"New B"});
c=compareThreeWay(base,arrayLeft,arrayRight);
assert.equal(c.summary.conflict,1);
assert.equal(c.changes[0].path,"/works");
assert.equal(c.changes[0].left.items,2);

const deleted=structuredClone(base),other=structuredClone(base);
delete deleted.profile.photo;
other.profile.photo="photo-b.jpg";
c=compareThreeWay(base,deleted,other);
assert.equal(c.summary.conflict,1);
assert.equal(c.changes[0].left.present,false);

assert.deepEqual(compareThreeWay({about:{x:1,y:2}},{about:{y:2,x:1}},{about:{x:1,y:2}}).changes,[]);
const swapped=compareThreeWay({about:{"a/b":1}},{about:{"a/b":2}},{about:{"a/b":1}});
assert.equal(swapped.changes[0].path,"/about/a~1b");
assert.throws(()=>compareThreeWay([],{},{}),/INVALID_COMPARISON_INPUT/);
const huge={};
for(let i=0;i<301;i++)huge["key_"+i]=i;
assert.throws(()=>compareThreeWay({},huge,{}),/TOO_MANY_COMPARISON_CHANGES/);
console.log("PASS: read-only three-way diffs classify non-overlap, identical changes, conflicts, deletion and atomic arrays.");
