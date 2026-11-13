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
let saves=0,reads=0,legacyWrites=0;
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
    canSave:false,canPublish:false,canUpload:false,canUseImmutableStudio:allowPrivate});
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
  page.on("dialog",dialog=>dialog.accept());
  await page.locator("#publish").click();
  await page.getByText(/新的私人草稿版本已儲存/).waitFor();
  assert.equal(await picker.inputValue(),ids.at(-1).id);
  assert.equal(await page.locator("#preview-site").isVisible(),false);
  assert.equal(await page.locator("#review-release").isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log("PASS: "+kind+" private Studio selects a version and creates a NEW immutable draft.");
  await ctx.close();
 }
 assert.equal(saves,2);
 assert.equal(legacyWrites,0);
 assert.ok(reads>=2);
 assert.deepEqual(snapshots.get(rootId),source,"Original snapshot must remain unchanged");
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
