// Isolated CHEN. revision comparison UI — read only, no save or publish actions.
// Served by authenticated Worker only when explicitly enabled.
export function revisionComparisonHtml(nonce) {
  if (typeof nonce !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(nonce)) {
    throw Error("Invalid CSP nonce");
  }
  const markup = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>CHEN. | 草稿版本比較</title>
<style nonce="__NONCE__">
:root{--ink:#1d1d1c;--muted:#777771;--line:#e7e7e3;--soft:#f8f8f6;--paper:#fff}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:13px/1.7 system-ui,-apple-system,"Noto Sans TC",Arial,sans-serif}
button,input,select{font:inherit}button{cursor:pointer}a{color:inherit}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:2px solid #555;outline-offset:3px}
header{padding:27px max(20px,calc((100% - 1050px)/2));border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:16px}
.brand{font-size:24px;letter-spacing:-.07em;font-weight:650;text-decoration:none}.back{font-size:12px}
main{max-width:1050px;margin:auto;padding:48px 20px 100px}h1{font-size:clamp(25px,4vw,37px);font-weight:400;margin:12px 0}
.subtitle{font-size:12px;color:var(--muted);margin:0 0 27px}.notice{padding:17px 20px;background:var(--soft);border:1px solid var(--line);font-size:12px;color:#555;margin:0 0 28px}
form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px}label{display:grid;gap:8px;color:#555;font-size:11px}
input,select{width:100%;min-width:0;background:#fff;border:1px solid #d5d5d0;padding:12px;font-size:12px}
.controls{margin:20px 0 30px;display:flex;align-items:center;gap:20px;flex-wrap:wrap}
button{background:#1d1d1c;color:white;border:1px solid #1d1d1c;padding:10px 23px}button:disabled{opacity:.5}
.status{font-size:12px;color:#666;white-space:pre-wrap}.status.error{color:#a33}
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:28px}
.stat{border:1px solid var(--line);padding:16px 12px}.stat strong{display:block;font-size:23px;font-weight:500}.stat span{font-size:11px;color:var(--muted)}
.result{border-top:1px solid var(--line);padding:20px 0;display:grid;grid-template-columns:minmax(140px,1fr) minmax(0,2fr);gap:20px}
.result h2{margin:0 0 7px;font-size:13px;font-weight:550;overflow-wrap:anywhere}.tag{font-size:10px;color:#666}
.versions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.version{min-width:0;padding:14px;border:1px solid var(--line);background:var(--soft)}
.version strong{display:block;font-size:10px;margin-bottom:8px;color:#777}.version p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;font-size:12px}
.empty{padding:22px;color:#777;border-top:1px solid var(--line)}
.history-tools{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:18px}.history-tools .status{flex:1}.history-card{padding:20px;border:1px solid var(--line);margin-bottom:22px}.history-card h2{font-size:14px;font-weight:500;margin:0 0 12px}.small-note{font-size:11px;color:#777;margin:9px 0 0}
@media(max-width:700px){header{padding:18px 20px}main{padding-top:30px}form{grid-template-columns:1fr}.summary{grid-template-columns:repeat(2,1fr)}.result{grid-template-columns:1fr}.versions{grid-template-columns:1fr}}
</style>
</head>
<body>
<header><a class="brand" href="/studio">CHEN.</a><a class="back" href="/studio">返回 Content Studio</a></header>
<main>
<div style="font-size:10px;letter-spacing:.16em;color:#999">CONTENT STUDIO / DRAFT HISTORY</div>
<h1>草稿版本比較</h1>
<p class="subtitle">比對同一份原始草稿衍生的兩個版本，辨識互相衝突的修改。</p>
<div class="notice">此頁僅供檢視差異。不會合併、儲存、刪除或發布任何內容。歷史清單僅供查閱，不保證包含尚未跨區同步的最新版本；不會自動合併任何資料。</div>
<section class="history-card" aria-label="歷史草稿版本選擇">
<h2>歷史草稿版本</h2>
<div class="history-tools"><button id="refresh-versions" type="button">讀取版本清單</button><button id="more-versions" type="button" hidden>載入更多版本</button><span id="history-status" role="status" aria-live="polite" class="status">尚未讀取任何歷史版本。</span></div>
<p class="small-note">依原始版本選出兩份直接衍生的修改。若版本不在已載入的清單中，可載入更多；不會自行判定哪一份是正式版本。</p>
</section>
<form id="compare-form" autocomplete="off">
<label>原始版本<select id="base-id" name="base" required><option value="">先讀取版本清單</option></select></label>
<label>版本 A<select id="left-id" name="left" required disabled><option value="">請先選擇原始版本</option></select></label>
<label>版本 B<select id="right-id" name="right" required disabled><option value="">請先選擇原始版本</option></select></label>
</form>
<div class="controls"><button id="compare-button" type="submit" form="compare-form" disabled>比較版本</button><span role="status" aria-live="polite" class="status" id="status">請先讀取歷史版本並選擇兩份修改。</span></div>
<section id="summary" class="summary" hidden aria-label="比較摘要"></section>
<section id="results" aria-label="欄位差異"></section>
</main>
<script nonce="__NONCE__">
(function(){
"use strict";
const form=document.getElementById("compare-form");
const button=document.getElementById("compare-button");
const status=document.getElementById("status");
const summary=document.getElementById("summary");
const results=document.getElementById("results");
const labels={"left-only":"僅版本 A 修改","right-only":"僅版本 B 修改","same-change":"兩邊修改相同","conflict":"修改衝突"};
const keys=["left-only","right-only","same-change","conflict"];
const idPattern=/^[A-Za-z0-9_-]{32,64}$/;
const refresh=document.getElementById("refresh-versions");
const more=document.getElementById("more-versions");
const historyStatus=document.getElementById("history-status");
const baseSelect=document.getElementById("base-id");
const leftSelect=document.getElementById("left-id");
const rightSelect=document.getElementById("right-id");
const known=new Map();
let cursor=null;
let fetching=false;
function option(value,label){const o=document.createElement("option");o.value=value;o.textContent=label;return o;}
function labelFor(record){
 const date=typeof record.createdAt==="string"&&Number.isFinite(Date.parse(record.createdAt))
  ?new Date(record.createdAt).toLocaleString("zh-TW"):"未知時間";
 return date+" · "+record.id.slice(0,9)+"…";
}
function chooseOptions(select,items,hint){
 const previous=select.value;
 select.replaceChildren(option("",hint));
 for(const entry of items)select.append(option(entry.id,labelFor(entry)));
 select.disabled=!items.length;
 if(items.some(entry=>entry.id===previous))select.value=previous;
}
function renderVersionOptions(){
 const records=[...known.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 chooseOptions(baseSelect,records,"選擇原始版本");
 const children=records.filter(entry=>entry.parentId===baseSelect.value);
 chooseOptions(leftSelect,children,"選擇版本 A");
 chooseOptions(rightSelect,children,"選擇版本 B");
 button.disabled=!baseSelect.value||!leftSelect.value||!rightSelect.value||leftSelect.value===rightSelect.value;
}
baseSelect.addEventListener("change",()=>{leftSelect.value="";rightSelect.value="";renderVersionOptions()});
leftSelect.addEventListener("change",renderVersionOptions);
rightSelect.addEventListener("change",renderVersionOptions);
async function loadVersions(reset){
 if(fetching)return;
 fetching=true;refresh.disabled=true;more.disabled=true;
 historyStatus.className="status";historyStatus.textContent="正在讀取私人草稿版本…";
 try{
  const next=reset?null:cursor;
  const url="/api/draft/revisions"+(next?"?cursor="+encodeURIComponent(next):"");
  const response=await fetch(url,{credentials:"same-origin",cache:"no-store"});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||"無法取得版本清單");
  if(!data||!Array.isArray(data.revisions)||typeof data.complete!=="boolean")throw Error("版本清單格式不正確");
  if(reset)known.clear();
  for(const record of data.revisions){
   if(!record||!idPattern.test(record.id)||
     !(record.parentId===null||idPattern.test(record.parentId)))throw Error("版本資料不完整");
   known.set(record.id,record);
  }
  cursor=data.complete?null:data.nextCursor;
  if(!data.complete&&typeof cursor!=="string")throw Error("版本分頁資料不完整");
  more.hidden=!cursor;
  renderVersionOptions();
  historyStatus.textContent="已載入 "+known.size+" 份版本。"+(cursor?"還有其他頁可載入。":"此區域目前沒有其他頁。")+"跨區同步中的版本可能暫時未出現。";
 }catch(error){
  historyStatus.className="status error";
  historyStatus.textContent="讀取失敗："+error.message+"。已載入版本不會被自動覆蓋。";
 }finally{fetching=false;refresh.disabled=false;more.disabled=false;}
}
refresh.addEventListener("click",()=>loadVersions(true));
more.addEventListener("click",()=>loadVersions(false));
function node(tag,cls,text){
 const element=document.createElement(tag);
 if(cls)element.className=cls;
 if(text!==undefined)element.textContent=String(text);
 return element;
}
function format(v){
 if(!v||v.present===false)return "（未設定或已刪除）";
 if(v.type==="array")return "清單，共 "+v.items+" 項（不自動合併）";
 if(v.type==="object")return "資料物件，共 "+v.fields+" 欄";
 if(v.type==="string")return v.text || "（空字串）";
 if(v.type==="null")return "（空值）";
 return String(v.value);
}
form.addEventListener("submit",async event=>{
 event.preventDefault();
 const ids=["base","left","right"].map(key=>form.elements.namedItem(key).value.trim());
 if(!known.has(ids[0])||known.get(ids[1])?.parentId!==ids[0]||known.get(ids[2])?.parentId!==ids[0]){
  status.className="status error";status.textContent="請從版本清單選擇同一原始版本的兩份修改。";return;
 }
 summary.hidden=true;summary.replaceChildren();results.replaceChildren();
 if(ids.some(id=>!idPattern.test(id))||new Set(ids).size!==3){
  status.className="status error";status.textContent="請輸入三個不同且有效的版本識別碼。";return;
 }
 button.disabled=true;status.className="status";status.textContent="正在讀取私人版本差異…";
 try{
  const url="/api/draft/compare?base="+encodeURIComponent(ids[0])+"&left="+encodeURIComponent(ids[1])+"&right="+encodeURIComponent(ids[2]);
  const response=await fetch(url,{credentials:"same-origin",cache:"no-store"});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||"比較失敗");
  if(!data||!Array.isArray(data.changes)||typeof data.summary!=="object")throw Error("比較回應格式不正確");
  summary.hidden=false;
  for(const key of keys){
   const stat=node("div","stat");
   stat.append(node("strong","",Number(data.summary[key]||0)),node("span","",labels[key]));
   summary.append(stat);
  }
  if(data.changes.length===0){results.append(node("p","empty","兩個版本與原始草稿沒有差異。"));}
  else for(const change of data.changes){
   const item=node("article","result");
   const name=node("div","");
   name.append(node("h2","",change.path),node("span","tag",labels[change.status]||"修改"));
   const comparison=node("div","versions");
   for(const [label,value] of [["原始版本",change.before],["電腦版本 A",change.left],["手機版本 B",change.right]]){
    const block=node("div","version");block.append(node("strong","",label),node("p","",format(value)));
    comparison.append(block);
   }
   item.append(name,comparison);results.append(item);
  }
  status.textContent=data.hasConflicts?"已完成比較：發現衝突，請勿直接覆蓋任一版本。":"已完成比較：未發現互相衝突的修改。";
 }catch(error){status.className="status error";status.textContent="無法比較："+error.message;}
 finally{button.disabled=false;}
});
})();
</script>
</body>
</html>`;
  return markup.replaceAll("__NONCE__", nonce);
}
