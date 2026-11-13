// Integration test: authenticated two-stage private publication through Worker routes.
// All Github APIs and KV are mocked, no production network or writes.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash,webcrypto} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import worker from "./src/worker.js";
import {buildPrivateMigrationBundle,EXPECTED_PUBLIC_ASSETS} from "./src/private-kv-migration-bundle.js";
const crypto=globalThis.crypto??webcrypto;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const live=JSON.parse(await readFile(path.join(root,"content/site.json"),"utf8"));
const files=Object.fromEntries(await Promise.all(EXPECTED_PUBLIC_ASSETS.map(async x=>[
 x.path,await readFile(path.join(root,x.path))
])));
const revisionId="R".repeat(32),contentSha="c".repeat(40),baseHead="1".repeat(40),
 treeSha="2".repeat(40),newCommit="3".repeat(40),rollbackCommit="5".repeat(40);
const bundle=buildPrivateMigrationBundle(live,files,{id:revisionId});
const origin="https://private-publish-test.invalid",cookies="chen_session=test-session";
const kv=new Map();
const keyBytes=crypto.getRandomValues(new Uint8Array(32));
const sessionIv=crypto.getRandomValues(new Uint8Array(12));
const imported=await crypto.subtle.importKey("raw",keyBytes,"AES-GCM",false,["encrypt"]);
const editor={login:"chenofficial0",csrf:"test-csrf",token:"MOCK_GITHUB_TOKEN",exp:Date.now()+600000};
const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv:sessionIv},imported,
 new TextEncoder().encode(JSON.stringify(editor)));
const digest=Buffer.from(await crypto.subtle.digest("SHA-256",new TextEncoder().encode("test-session"))).toString("base64url");
kv.set("session:"+digest,Buffer.from(sessionIv).toString("base64")+"."+Buffer.from(ciphertext).toString("base64"));
const env={
 PUBLIC_API_ORIGIN:origin,GITHUB_CLIENT_ID:"MOCK_ID",SESSION_ENCRYPTION_KEY:Buffer.from(keyBytes).toString("base64"),
 ENABLE_DRAFT_SAVES:"true",ENABLE_LIVE_PUBLISH:"true",
 ENABLE_IMMUTABLE_DRAFTS:"true",ENABLE_PRIVATE_STUDIO:"true",ENABLE_PRIVATE_PUBLISH_PLANS:"true",
 ENABLE_PRIVATE_PUBLISH_CONFIRM:"true",ENABLE_PRIVATE_ROLLBACK:"true",
 STUDIO_KV:{get:async k=>kv.get(k)??null,put:async(k,v)=>{kv.set(k,v)},delete:async k=>kv.delete(k)},
 PRIVATE_DRAFT_KV:{get:async(k,format)=>{
  if(k==="draft-revision-v1/"+revisionId)return bundle.recordText;
  const file=bundle.media.find(x=>x.key===k);
  if(file&&format==="arrayBuffer")return file.bytes.buffer.slice(file.bytes.byteOffset,file.bytes.byteOffset+file.bytes.byteLength);
  return null;
 },put:async()=>{throw Error("PRIVATE_KV_WRITE_FORBIDDEN_IN_REVIEW")},
 delete:async()=>{throw Error("PRIVATE_KV_DELETE_FORBIDDEN_IN_REVIEW")}}
};
let head=baseHead,gitWrites=0,refUpdates=0;
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
const gitSha=bytes=>createHash("sha1").update("blob "+bytes.length+"\0").update(bytes).digest("hex");
const oldFetch=globalThis.fetch;
globalThis.fetch=async(url,options={})=>{
 const u=new URL(url);if(u.host!=="api.github.com")throw Error("UNEXPECTED_EXTERNAL_URL");
 if(u.pathname.endsWith("/contents/content/site.json")&&u.searchParams.get("ref")==="main")
  return response({sha:contentSha,encoding:"base64",content:Buffer.from(JSON.stringify(live)).toString("base64")});
 if(u.pathname.endsWith("/git/ref/heads/main")&&(!options.method||options.method==="GET"))
  return response({object:{sha:head}});
 if(u.pathname.endsWith("/git/commits/"+baseHead))return response({tree:{sha:treeSha}});
 if(u.pathname.endsWith("/git/commits/"+newCommit))return response({
   tree:{sha:"4".repeat(40)},message:"Publish reviewed CHEN private revision "+revisionId,
   parents:[{sha:baseHead}]
 });
 if(u.pathname.includes("/contents/assets/uploads/")){
  const file=files[u.pathname.split("/contents/")[1]];
  return file?response({sha:gitSha(file)}):response({error:"missing"},404);
 }
 if(options.method==="POST"&&u.pathname.endsWith("/git/blobs")){
  gitWrites++;const b=JSON.parse(options.body);
  const buf=b.encoding==="base64"?Buffer.from(b.content,"base64"):Buffer.from(b.content,"utf8");
  return response({sha:gitSha(buf)});
 }
 if(options.method==="POST"&&u.pathname.endsWith("/git/trees")){
  gitWrites++;const b=JSON.parse(options.body);
  assert.equal(b.base_tree,treeSha);return response({sha:"4".repeat(40)});
 }
 if(options.method==="POST"&&u.pathname.endsWith("/git/commits")){
  gitWrites++;const b=JSON.parse(options.body);
  if(b.parents[0]===newCommit){
   assert.equal(b.tree,treeSha);return response({sha:rollbackCommit});
  }
  assert.deepEqual(b.parents,[baseHead]);return response({sha:newCommit});
 }
 if(options.method==="PATCH"&&u.pathname.endsWith("/git/refs/heads/main")){
  const b=JSON.parse(options.body);assert.equal(b.force,false);
  if(b.sha===newCommit){assert.equal(head,baseHead);head=newCommit;}
  else{assert.equal(b.sha,rollbackCommit);assert.equal(head,newCommit);head=rollbackCommit;}
  refUpdates++;return response({object:{sha:head}});
 }
 throw Error("UNEXPECTED_GITHUB_REQUEST_"+u.pathname+"_"+(options.method||"GET"));
};
const call=(path,method="GET",headers={},body=null)=>worker.fetch(new Request(origin+path,{
 method,headers:{cookie:cookies,...headers},...(body?{body:JSON.stringify(body)}:{})
}),env);
const post=(path,body,headers={})=>call(path,"POST",{origin,"x-chen-csrf":"test-csrf","content-type":"application/json",...headers},body);
try{
 const noOrigin=await call("/api/publish/private-review","POST",{"x-chen-csrf":"test-csrf"},
  {revisionId,confirmation:"REVIEW_PRIVATE_PUBLICATION"});
 assert.equal(noOrigin.status,403);
 const noCsrf=await post("/api/publish/private-review",
  {revisionId,confirmation:"REVIEW_PRIVATE_PUBLICATION"},{"x-chen-csrf":"bad"});
 assert.equal(noCsrf.status,403);
 const anonymous=await worker.fetch(new Request(origin+"/api/publish/private-review",{
  method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({
    revisionId,confirmation:"REVIEW_PRIVATE_PUBLICATION"
  })
 }),env);
 assert.equal(anonymous.status,401);
 const reviewResp=await post("/api/publish/private-review",{revisionId,confirmation:"REVIEW_PRIVATE_PUBLICATION"});
 assert.equal(reviewResp.status,200,"review failed "+await reviewResp.clone().text());
 const review=await reviewResp.json();
 assert.equal(review.published,false);
 assert.equal(review.proposedPublicMedia.length,2);
 assert.equal(review.willExposePrivateMedia,true);
 assert.equal(gitWrites,0);
 const denied=await post("/api/publish/private-confirm",{
  reviewId:review.reviewId,confirmation:"PUBLISH_APPROVED_PRIVATE_REVISION"
 });
 assert.equal(denied.status,422);
 assert.equal(gitWrites,0);
 const publish=await post("/api/publish/private-confirm",{
  reviewId:review.reviewId,confirmation:"PUBLISH_APPROVED_PRIVATE_REVISION",
  mediaConfirmation:"I_APPROVE_PUBLIC_MEDIA"
 });
 assert.equal(publish.status,200,"confirm failed "+await publish.clone().text());
 const result=await publish.json();
 assert.equal(result.published,true);
 assert.equal(result.commit,newCommit);
 assert.equal(refUpdates,1);
 assert.equal(gitWrites,3,"existing identical photos should avoid duplicate Git uploads");
 const retry=await post("/api/publish/private-confirm",{
  reviewId:review.reviewId,confirmation:"PUBLISH_APPROVED_PRIVATE_REVISION",
  mediaConfirmation:"I_APPROVE_PUBLIC_MEDIA"
 });
 assert.equal(retry.status,409);
 assert.equal(refUpdates,1);
 const rollbackReview=await post("/api/publish/private-rollback-review",{
  confirmation:"REVIEW_PUBLIC_SITE_ROLLBACK",publishedCommit:newCommit
 });
 assert.equal(rollbackReview.status,200,"rollback review failed "+await rollbackReview.clone().text());
 const rollbackPlan=await rollbackReview.json();
 assert.equal(rollbackPlan.previousPublicationHistoryMayRemainPublic,true);
 assert.equal(rollbackPlan.publishedCommit,newCommit);
 const rollback=await post("/api/publish/private-rollback-confirm",{
  reviewId:rollbackPlan.reviewId,confirmation:"RESTORE_PREVIOUS_PUBLIC_SITE"
 });
 assert.equal(rollback.status,200,"rollback failed "+await rollback.clone().text());
 const restored=await rollback.json();
 assert.equal(restored.restored,true);
 assert.equal(restored.commit,rollbackCommit);
 assert.equal(refUpdates,2);
 const rollbackRetry=await post("/api/publish/private-rollback-confirm",{
  reviewId:rollbackPlan.reviewId,confirmation:"RESTORE_PREVIOUS_PUBLIC_SITE"
 });
 assert.equal(rollbackRetry.status,409);
 assert.equal(refUpdates,2);
 env.ENABLE_PRIVATE_PUBLISH_CONFIRM="false";
 assert.equal((await post("/api/publish/private-review",{revisionId,confirmation:"REVIEW_PRIVATE_PUBLICATION"})).status,403);
 console.log("PASS: authenticated two-stage private release requires media disclosure, Origin, CSRF and prevents repeat commit.");
}finally{globalThis.fetch=oldFetch}
