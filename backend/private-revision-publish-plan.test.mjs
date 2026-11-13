import assert from "node:assert/strict";
import {planPrivateRevisionPublish,PUBLIC_ORIGIN} from "./src/private-revision-publish-plan.js";
const rootId="R".repeat(32);
const photoA="private-kv/chen-hero-2026-11-12-8tp6PGMB_zcRxazp.jpg";
const photoB="private-kv/chen-profile-2026-11-12-mragG3nnw0NgdAUw.jpg";
const base={about:{name_zh:"公開版",hero_images:[]},profile:{photo:""},contact:{email:"example@example.com"},works:[],gallery:[]};
const source=structuredClone(base);
source.about.name_zh="待發布";
source.about.hero_images=[{image:photoA,caption:"形象照"},{image:photoA,caption:"重複使用"}];
source.profile.photo=photoB;
const before=JSON.stringify(source);
const valid=x=>!!x&&typeof x==="object"&&!Array.isArray(x)&&!!x.about&&!!x.profile&&!!x.contact&&
 Array.isArray(x.works)&&Array.isArray(x.gallery);
const plan=await planPrivateRevisionPublish({revisionId:rootId,data:source,liveData:base,validate:valid});
assert.equal(JSON.stringify(source),before,"The source draft must not be edited");
assert.equal(plan.publicData.about.name_zh,"待發布");
assert.equal(plan.publicData.profile.photo,PUBLIC_ORIGIN+"assets/uploads/chen-profile-2026-11-12-mragG3nnw0NgdAUw.jpg");
assert.equal(plan.publicData.about.hero_images[0].image,PUBLIC_ORIGIN+"assets/uploads/chen-hero-2026-11-12-8tp6PGMB_zcRxazp.jpg");
assert.equal(plan.media.length,2,"Duplicate photo references are copied only once");
assert.equal(plan.mediaReferences,3);
assert.equal(plan.mayWrite,false);
assert.equal(plan.published,false);
assert.equal(plan.willExposePrivateMedia,true);
assert.equal(plan.explicitApprovalRequired,true);
assert.deepEqual(plan.changedSections,["about","profile"]);
assert.match(plan.sourceDigest,/^[a-f0-9]{64}$/);
assert.match(plan.publishedDigest,/^[a-f0-9]{64}$/);
assert.notEqual(plan.sourceDigest,plan.publishedDigest);
const second=await planPrivateRevisionPublish({revisionId:rootId,data:source,liveData:base,validate:valid});
assert.equal(second.publishedDigest,plan.publishedDigest);
await assert.rejects(planPrivateRevisionPublish({revisionId:"invalid",data:source,liveData:base,validate:valid}),/INVALID_PUBLISH_REVISION/);
await assert.rejects(planPrivateRevisionPublish({revisionId:rootId,data:source,liveData:base,validate:()=>false}),/PUBLISH_CONTENT_INVALID/);
for(const [path,value] of [
 ["profile",{"photo":"private-kv/other.jpg"}],
 ["profile",{"photo":"private-media/chen-profile-2026-11-12-mragG3nnw0NgdAUw.jpg"}],
 ["profile",{"photo":"private-kv/chen-profile-2026-11-12-mragG3nnw0NgdAUw.pdf"}]
]){
 const altered=structuredClone(source);altered[path]=value;
 if(value.photo.endsWith(".pdf")){
  const out=await planPrivateRevisionPublish({revisionId:rootId,data:altered,liveData:base,validate:valid});
  assert.ok(out.media.some(x=>x.publicPath.endsWith(".pdf")));
 }else await assert.rejects(planPrivateRevisionPublish({revisionId:rootId,data:altered,liveData:base,validate:valid}),
  /INVALID_PRIVATE_MEDIA_REFERENCE|PRIVATE_REF_IN_UNRECOGNIZED_FIELD/);
}
const hidden=structuredClone(source);hidden.contact.other="private-kv/chen-hero-2026-11-12-8tp6PGMB_zcRxazp.jpg";
await assert.rejects(planPrivateRevisionPublish({revisionId:rootId,data:hidden,liveData:base,validate:valid}),
 /PRIVATE_REF_IN_UNRECOGNIZED_FIELD/);
const misplaced=structuredClone(source);
misplaced.contact.image=photoA;
await assert.rejects(planPrivateRevisionPublish({revisionId:rootId,data:misplaced,liveData:base,validate:valid}),
 /PRIVATE_REF_IN_UNRECOGNIZED_FIELD/);
const profileResource=structuredClone(source);
profileResource.profile.links=[{label:"演員資料",kind:"jpg",url:"private-kv/chen-resource-2026-11-12-8tp6PGMB_zcRxazp.jpg"}];
const profilePlan=await planPrivateRevisionPublish({revisionId:rootId,data:profileResource,liveData:base,validate:valid});
assert.ok(profilePlan.media.some(x=>x.publicPath==="assets/uploads/chen-resource-2026-11-12-8tp6PGMB_zcRxazp.jpg"));
const empty=await planPrivateRevisionPublish({revisionId:rootId,data:base,liveData:base,validate:valid});
assert.equal(empty.media.length,0);assert.equal(empty.willExposePrivateMedia,false);
assert.deepEqual(empty.changedSections,[]);
// Golden test: migrating the current two-photo draft to private KV and planning a
// publication should reproduce the original public snapshot without any writes.
const {readFile}=await import("node:fs/promises");
const {fileURLToPath}=await import("node:url");
const path=(await import("node:path")).default;
const {buildPrivateMigrationBundle,EXPECTED_PUBLIC_ASSETS}=await import("./src/private-kv-migration-bundle.js");
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const publicSnapshot=JSON.parse(await readFile(path.join(root,"content/site.json"),"utf8"));
const assetFiles=Object.fromEntries(await Promise.all(EXPECTED_PUBLIC_ASSETS.map(async spec=>[
 spec.path,await readFile(path.join(root,spec.path))
])));
const migrated=buildPrivateMigrationBundle(publicSnapshot,assetFiles,{id:rootId});
const actual=await planPrivateRevisionPublish({
 revisionId:rootId,data:migrated.record.data,liveData:publicSnapshot,validate:valid
});
assert.deepEqual(actual.publicData,publicSnapshot);
assert.equal(actual.media.length,2);
assert.equal(actual.willExposePrivateMedia,true);
assert.equal(actual.mayWrite,false);
assert.equal(actual.published,false);
console.log("PASS: private publication plan lists all media, rewrites only reviewed fields, detects privacy leaks and does not write.");
