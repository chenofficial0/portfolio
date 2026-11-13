import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {buildPrivateMigrationBundle,EXPECTED_PUBLIC_ASSETS} from "./src/private-kv-migration-bundle.js";
import {planPrivateRevisionPublish} from "./src/private-revision-publish-plan.js";
import {prepareApprovedRelease,prepareRollback} from "./src/private-revision-publish-transaction.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=JSON.parse(await readFile(path.join(root,"content/site.json"),"utf8"));
const files=Object.fromEntries(await Promise.all(EXPECTED_PUBLIC_ASSETS.map(async spec=>[
 spec.path,await readFile(path.join(root,spec.path))
])));
const id="R".repeat(32);
const bundle=buildPrivateMigrationBundle(source,files,{id});
const valid=d=>d&&typeof d==="object"&&d.about&&d.profile&&d.contact&&Array.isArray(d.works)&&Array.isArray(d.gallery);
const plan=await planPrivateRevisionPublish({revisionId:id,data:bundle.record.data,liveData:source,validate:valid});
const SHA1=b=>createHash("sha1").update("blob "+b.length+"\0").update(b).digest("hex");
const origHead="1".repeat(40),originalTree="2".repeat(40);
const issued={tree:"3".repeat(40),commit:"4".repeat(40),rollback:"5".repeat(40)};
function mock({existing=true,raceAt=null,writeFails=false}={}){
 let head=origHead;let commits=0,uploaded=0,branches=0,filesCreated=0;
 const calls=[];
 const adapter={
  getMainSha:async()=>{calls.push("getMainSha");if(raceAt==="beforeUpdate"&&commits===1)head="9".repeat(40);return head},
  getMainTreeSha:async sha=>{assert.equal(sha,origHead);return originalTree},
  getPathSha:async(_head,p)=>{
   assert.ok(p.startsWith("assets/uploads/"));return existing?SHA1(files[p]):null;
  },
  createBlob:async(bytes,encoding)=>{
   filesCreated++;assert.ok(["base64","utf-8"].includes(encoding));
   return SHA1(Buffer.from(bytes));
  },
  createTree:async(base,changes)=>{
   assert.equal(base,originalTree);
   assert.equal(changes[0].path,"content/site.json");
   for(const change of changes)assert.match(change.sha,/^[a-f0-9]{40}$/);
   uploaded=changes.filter(change=>change.path!=="content/site.json").length;
   calls.push("tree");return issued.tree;
  },
  createCommit:async({parentSha,treeSha})=>{
   commits++;calls.push("commit");
   if(commits===1){assert.equal(parentSha,origHead);assert.equal(treeSha,issued.tree);return issued.commit;}
   assert.equal(parentSha,issued.commit);assert.equal(treeSha,originalTree);
   return issued.rollback;
  },
  updateMainRef:async(sha,{force})=>{
   assert.equal(force,false);
   branches++;calls.push("update");
   if(writeFails)throw Error("GitHub PATCH failed");
   if(sha===issued.commit){assert.equal(head,origHead);head=sha;}
   else{assert.equal(sha,issued.rollback);assert.equal(head,issued.commit);head=sha;}
  }
 };
 return {adapter,calls,get state(){return {head,commits,uploaded,branches,filesCreated}}};
}
const kwargs={revisionId:id,data:bundle.record.data,liveData:source,validate:valid,
 expectedSourceDigest:plan.sourceDigest,expectedPublishedDigest:plan.publishedDigest,
 expectedMainSha:origHead,confirmation:"PUBLISH_APPROVED_PRIVATE_REVISION",
 loadPrivateMedia:async name=>bundle.media.find(m=>m.key===name)};
const first=mock();
const pub=await prepareApprovedRelease({...kwargs,adapter:first.adapter});
assert.equal(pub.published,true);
assert.equal(pub.commitSha,issued.commit);
assert.equal(pub.previousTreeSha,originalTree);
assert.equal(first.state.uploaded,0,"Identical photos already public must not be rewritten");
assert.equal(first.state.branches,1);
assert.equal(first.state.filesCreated,1,"Only content blob changes if photos are identical");
const rollback=await prepareRollback({publication:pub,confirmation:"RESTORE_PREVIOUS_PUBLIC_SITE",adapter:first.adapter});
assert.equal(rollback.restored,true);
assert.equal(rollback.historicalMediaMayRemainPublic,true);
assert.equal(first.state.head,issued.rollback);
assert.equal(first.state.branches,2);

const newPhotos=mock({existing:false});
const newPub=await prepareApprovedRelease({...kwargs,adapter:newPhotos.adapter});
assert.equal(newPub.mediaFiles,2);
assert.equal(newPhotos.state.uploaded,2);
assert.equal(newPhotos.state.filesCreated,3);

const denied=mock();
await assert.rejects(prepareApprovedRelease({...kwargs,confirmation:"PUBLISH",adapter:denied.adapter}),/RELEASE_EXPLICIT_CONFIRMATION_REQUIRED/);
await assert.rejects(prepareApprovedRelease({...kwargs,expectedSourceDigest:"f".repeat(64),adapter:denied.adapter}),/RELEASE_REVIEW_CHANGED/);
assert.deepEqual(denied.calls,[],"Never touch remote when approval fails");

const changed=mock({raceAt:"beforeUpdate"});
await assert.rejects(prepareApprovedRelease({...kwargs,adapter:changed.adapter}),/RELEASE_MAIN_CHANGED_BEFORE_REF_UPDATE/);
assert.equal(changed.state.branches,0);
const failed=mock({writeFails:true});
await assert.rejects(prepareApprovedRelease({...kwargs,adapter:failed.adapter}),/RELEASE_REF_UPDATE_UNCERTAIN/);
assert.equal(failed.state.branches,1);

const missing=mock();
await assert.rejects(prepareApprovedRelease({...kwargs,adapter:missing.adapter,loadPrivateMedia:async()=>null}),/RELEASE_MEDIA_MISSING/);
assert.equal(missing.state.branches,0);
const corrupt=mock({existing:false});
await assert.rejects(prepareApprovedRelease({...kwargs,adapter:corrupt.adapter,
 loadPrivateMedia:async()=>({bytes:new Uint8Array(120)})}),/RELEASE_MEDIA_SIGNATURE_INVALID/);
assert.equal(corrupt.state.branches,0);
const different=mock({existing:true});
const prior=different.adapter.getPathSha;
different.adapter.getPathSha=async()=> "a".repeat(40);
await assert.rejects(prepareApprovedRelease({...kwargs,adapter:different.adapter}),/RELEASE_MEDIA_PUBLIC_COLLISION/);
assert.equal(different.state.branches,0);
const rollbackWrong=mock();
await assert.rejects(prepareRollback({publication:pub,confirmation:"RESTORE_PREVIOUS_PUBLIC_SITE",adapter:rollbackWrong.adapter}),/ROLLBACK_MAIN_CHANGED/);
assert.equal(rollbackWrong.state.branches,0);
await assert.rejects(prepareRollback({publication:pub,confirmation:"rollback",adapter:rollbackWrong.adapter}),/ROLLBACK_CONFIRMATION_REQUIRED/);
console.log("PASS: private publishing Git transaction rehearses exact public snapshot, media deduplication, CAS, fail-closed writes and append-only rollback.");
