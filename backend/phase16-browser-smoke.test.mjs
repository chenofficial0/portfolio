// CHEN. Content Studio browser smoke — synthetic fixtures only, no live network.
// Requires playwright installed in backend node_modules; CI installs it ephemerally.
import assert from "node:assert/strict";
import http from "node:http";
import {chromium, devices} from "playwright";
import {revisionComparisonHtml} from "./src/revision-compare-page.js";

const ids=["A","B","C"].map(x=>x.repeat(32));
const [base,left,right]=ids;
const records=[
  {id:base,parentId:null,sha:"a".repeat(64),createdAt:"2026-11-13T06:00:00Z"},
  {id:left,parentId:base,sha:"b".repeat(64),createdAt:"2026-11-13T06:05:00Z"},
  {id:right,parentId:base,sha:"c".repeat(64),createdAt:"2026-11-13T06:10:00Z"}
];
const report={base,left,right,
  changes:[{path:"/about/name_zh",status:"conflict",
    before:{present:true,type:"string",text:"原始介紹"},
    left:{present:true,type:"string",text:"版本 A 介紹"},
    right:{present:true,type:"string",text:"版本 B 介紹"}}],
  summary:{"left-only":0,"right-only":0,"same-change":0,conflict:1},
  hasConflicts:true,automaticMergePerformed:false
};
let latestDecision=null;
let reads=0;
let saveEnabled=false;
let saveRequests=0;
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,"http://127.0.0.1");
 const json=(body,status=200)=>{
   res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});
   res.end(JSON.stringify(body));
 };
 if(req.method==="GET"&&url.pathname==="/studio/revisions"){
   res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});
   res.end(revisionComparisonHtml("testnonce0123456789"));return;
 }
 if(req.method==="GET"&&url.pathname==="/api/session"){
   json({authenticated:true,csrf:"test-csrf",canSaveMerge:saveEnabled});return;
 }
 if(req.method==="GET"&&url.pathname==="/api/draft/revisions"){
   reads++;json({revisions:records,nextCursor:null,complete:true});return;
 }
 if(req.method==="GET"&&url.pathname==="/api/draft/compare"){
   assert.equal(url.searchParams.get("base"),base);
   assert.equal(url.searchParams.get("left"),left);
   assert.equal(url.searchParams.get("right"),right);
   json(report);return;
 }
 if(req.method==="POST"&&url.pathname==="/api/draft/merge-preview"){
   const pieces=[];for await(const part of req)pieces.push(part);
   const body=JSON.parse(Buffer.concat(pieces).toString("utf8"));
   assert.equal(req.headers["x-chen-csrf"],"test-csrf");
   latestDecision=body.decisions["/about/name_zh"];
   json({ready:true,merged:{about:{name_zh:latestDecision==="left"?"版本 A 介紹":"版本 B 介紹"},
     profile:{},works:[],gallery:[],contact:{}},
     persisted:false,published:false,previewDigest:"d".repeat(64)});return;
 }
 if(req.method==="POST"&&url.pathname==="/api/draft/merge-save"){
   const parts=[];for await(const part of req)parts.push(part);
   const input=JSON.parse(Buffer.concat(parts).toString("utf8"));
   assert.equal(input.confirmation,"SAVE_MERGE_AS_NEW_REVISION");
   assert.equal(input.previewDigest,"d".repeat(64));
   assert.equal(req.headers["x-chen-csrf"],"test-csrf");
   saveRequests++;
   json({ok:true,revision:{id:"D".repeat(32)},published:false,
     originalRevisionsPreserved:true,alreadySaved:false});return;
 }
 json({error:"Unsupported test route"},404);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const baseUrl="http://127.0.0.1:"+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const [mode,contextOptions] of [
   ["desktop",{viewport:{width:1366,height:900}}],
   ["mobile",{...devices["iPhone 13"],defaultBrowserType:undefined}]
 ]){
   saveEnabled=mode==="desktop";
   const context=await browser.newContext(contextOptions);
   const page=await context.newPage();
   const errors=[];
   page.on("pageerror",error=>errors.push(error.message));
   await page.goto(baseUrl+"/studio/revisions");
   assert.equal(await page.title(),"CHEN. | 草稿版本比較");
   await page.getByRole("button",{name:"讀取版本清單"}).click();
   await page.locator("#base-id").selectOption(base);
   await page.locator("#left-id").selectOption(left);
   await page.locator("#right-id").selectOption(right);
   await page.getByRole("button",{name:"比較版本"}).click();
   await page.getByText("修改衝突",{exact:true}).first().waitFor();
   assert.equal(await page.locator("#merge-preview-button").isDisabled(),true);
   await page.getByText("保留版本 A",{exact:true}).click();
   assert.equal(await page.locator("#merge-preview-button").isEnabled(),true);
   await page.getByRole("button",{name:"產生合併預覽"}).click();
   await page.getByText("合併預覽已產生，沒有寫入任何儲存位置。").waitFor();
   assert.equal(latestDecision,"left");
   assert.equal(await page.locator("#save-merge-area").isVisible(),saveEnabled);
   if(saveEnabled){
     page.on("dialog",dialog=>dialog.accept());
     await page.getByRole("button",{name:"確認另存為新草稿版本"}).click();
     await page.getByText(/已另存全新草稿版本/).waitFor();
     assert.equal(saveRequests,1);
     assert.equal(await page.getByRole("button",{name:"確認另存為新草稿版本"}).isDisabled(),true);
   }
   const metrics=await page.evaluate(()=>({
     documentWidth:document.documentElement.scrollWidth,viewportWidth:window.innerWidth
   }));
   assert.ok(metrics.documentWidth<=metrics.viewportWidth+2,
     mode+" horizontal overflow: "+JSON.stringify(metrics));
   assert.deepEqual(errors,[],mode+" browser JS errors");
   console.log("PASS: "+mode+" version selection, merge choice, preview, no save and responsive width.");
   await context.close();
 }
 assert.ok(reads>=2);
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
