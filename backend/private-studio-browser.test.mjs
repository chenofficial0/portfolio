// Browser test of gated private Content Studio using synthetic, local-only data.
// This server never contacts Cloudflare, GitHub or any public site.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import http from "node:http";
import {chromium,devices} from "playwright";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const html=await readFile(path.join(root,"admin/studio.html"),"utf8");
const source=JSON.parse(await readFile(path.join(root,"content/site.json"),"utf8"));
const rootId="R".repeat(32);
const ids=[{id:rootId,parentId:null,createdAt:"2026-11-13T08:00:00Z"}];
const snapshots=new Map([[rootId,source]]);
let saves=0,reads=0,legacyWrites=0,reviewWrites=0,publicWrites=0,rollbackWrites=0;
let allowPublish=false;
let allowPrivate=true;
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,"http://127.0.0.1");
 const json=(v,status=200)=>{res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify(v))};
 if(req.method==="GET"&&url.pathname==="/studio/private"){
  res.writeHead(200,{"content-type":"text/html; charset=utf-8"});
  res.end(html);return;
 }
 if(req.method==="GET"&&url.pathname==="/api/session"){
  json({authenticated:true,csrf:"test-csrf",login:"test-editor",
    canSave:false,canPublish:false,canUpload:false,canUseImmutableStudio:allowPrivate,canReviewPrivatePublish:allowPublish,canRollbackPrivatePublish:allowPublish});
  return;
 }
 if(req.method==="GET"&&url.pathname==="/api/draft/revisions"){
  json({revisions:[...ids],nextCursor:null,complete:true});return;
 }
 if(req.method==="GET"&&url.pathname==="/api/draft/revision"){
  reads++;
  const id=url.searchParams.get("id");
  json({data:snapshots.get(id),immutable:true,sha:id},snapshots.has(id)?200:404);return;
 }
 if(req.method==="POST"&&url.pathname==="/api/draft/revision"){
  let raw="";for await(const chunk of req)raw+=chunk;
  const body=JSON.parse(raw);
  assert.equal(req.headers["x-chen-csrf"],"test-csrf");
  assert.ok(snapshots.has(body.parentId));
  assert.ok(body.data.about&&body.data.profile);
  saves++;const id=String(saves).padStart(32,"A");
  snapshots.set(id,body.data);ids.push({id,parentId:body.parentId,createdAt:"2026-11-13T08:20:00Z"});
  json({id,parentId:body.parentId,immutable:true},201);return;
 }
 if(req.method==="GET"&&url.pathname==="/api/publish/private-plan"){
  if(!allowPublish)return json({error:"Disabled"},403);
  const id=url.searchParams.get("revision");
  return json({revisionId:id,mayWrite:false,published:false,
    changedSections:["about"],media:[{source:"private-kv/chen-hero-2026-11-12-8tp6PGMB_zcRxazp.jpg",
      publicPath:"assets/uploads/chen-hero-2026-11-12-8tp6PGMB_zcRxazp.jpg"}]});
 }
 if(req.method==="POST"&&url.pathname==="/api/publish/private-review"){
  const parts=[];for await(const chunk of req)parts.push(chunk);
  const body=JSON.parse(Buffer.concat(parts).toString("utf8"));
  assert.equal(req.headers["x-chen-csrf"],"test-csrf");
  assert.equal(body.confirmation,"REVIEW_PRIVATE_PUBLICATION");
  assert.equal(body.revisionId,ids.at(-1).id);
  reviewWrites++;
  return json({reviewId:"P".repeat(43),revisionId:body.revisionId,
    willExposePrivateMedia:true});
 }
 if(req.method==="POST"&&url.pathname==="/api/publish/private-confirm"){
  const parts=[];for await(const chunk of req)parts.push(chunk);
  const body=JSON.parse(Buffer.concat(parts).toString("utf8"));
  assert.equal(body.confirmation,"PUBLISH_APPROVED_PRIVATE_REVISION");
  assert.equal(body.mediaConfirmation,"I_APPROVE_PUBLIC_MEDIA");
  assert.equal(body.reviewId,"P".repeat(43));
  publicWrites++;
  return json({published:true,commit:"b".repeat(40)});
 }
 if(req.method==="POST"&&url.pathname==="/api/publish/private-rollback-review"){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));
  assert.equal(body.confirmation,"REVIEW_PUBLIC_SITE_ROLLBACK");
  assert.equal(body.publishedCommit,"b".repeat(40));
  return json({reviewId:"Q".repeat(43),publishedCommit:body.publishedCommit,
    previousPublicationHistoryMayRemainPublic:true});
 }
 if(req.method==="POST"&&url.pathname==="/api/publish/private-rollback-confirm"){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));
  assert.equal(body.reviewId,"Q".repeat(43));
  assert.equal(body.confirmation,"RESTORE_PREVIOUS_PUBLIC_SITE");
  rollbackWrites++;
  return json({restored:true,commit:"c".repeat(40),priorMediaMayRemainPublic:true});
 }
 if(req.method==="PUT"&&url.pathname==="/api/content"){
  legacyWrites++;json({error:"Legacy writes are blocked"},403);return;
 }
 json({error:"Unknown test route"},404);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const url="http://127.0.0.1:"+server.address().port;
let browser;
try{
 browser=await chromium.launch();
 for(const [kind,options] of [["desktop",{viewport:{width:1366,height:900}}],
    ["mobile",{...devices["iPhone 13"],defaultBrowserType:undefined}]]){
  allowPublish=kind==="desktop";
  const ctx=await browser.newContext(options);
  const page=await ctx.newPage();
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(url+"/studio/private");
  const picker=page.locator("#private-revision-picker");
  await picker.waitFor({state:"visible"});
  assert.equal(await page.locator("#publish").isVisible(),false,"Must select a version before saving");
  await picker.selectOption(rootId);
  await page.getByText(/已選擇私人草稿版本/).waitFor();
  assert.equal(await page.locator("#publish").isVisible(),true);
  await page.locator('[data-page="about"]').click();
  const about=page.locator(".field input").first();
  assert.ok(await about.isVisible(),"About editor must be editable");
  await about.fill(kind==="desktop"?"桌面測試":"手機測試");
  page.on("dialog",dialog=>dialog.type()==="prompt"
    ?dialog.accept(dialog.message().includes("RESTORE PUBLIC SITE")?"RESTORE PUBLIC SITE":"PUBLISH APPROVED")
    :dialog.accept());
  await page.locator("#publish").click();
  await page.getByText(/新的私人草稿版本已儲存/).waitFor();
  assert.equal(await picker.inputValue(),ids.at(-1).id);
  assert.equal(await page.locator("#preview-site").isVisible(),true);
  assert.equal(await page.locator("#preview-site").isEnabled(),true);
  assert.equal(await page.locator("#review-release").isVisible(),allowPublish);
  if(allowPublish){
    await page.locator("#review-release").click();
    await page.getByText(/預計公開的私人檔案數：1/).waitFor();
    const reviewAction=page.getByRole("button",{name:"建立發布審閱單"});
    await reviewAction.click();
    assert.equal(reviewWrites,0,"Cannot issue review without checked disclosure");
    await page.locator(".release-check input[type=checkbox]").check();
    await reviewAction.click();
    await page.getByText(/已建立五分鐘有效的審閱單/).waitFor();
    assert.equal(reviewWrites,1);
    await page.getByRole("button",{name:"最終確認並公開發布"}).click();
    await page.getByText(/已提交正式網站更新/).waitFor();
    assert.equal(publicWrites,1);
    await page.getByRole("button",{name:"還原這次正式發布"}).click();
    await page.getByText(/網站內容已提交還原/).waitFor();
    assert.equal(rollbackWrites,1);
  }
  assert.deepEqual(errors,[]);
  console.log("PASS: "+kind+" private Studio selects a version and creates a NEW immutable draft.");
  await ctx.close();
 }
 assert.equal(saves,2);
 assert.equal(reviewWrites,1);
 assert.equal(publicWrites,1);
 assert.equal(rollbackWrites,1);
 assert.equal(legacyWrites,0);
 assert.ok(reads>=2);
 assert.deepEqual(snapshots.get(rootId),source,"Original snapshot must remain unchanged");
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
