/**
 * CHEN. Content Studio trusted API (Cloudflare Worker).
 * No secrets or credentials belong in the public GitHub Pages repository.
 * Publish only after registering a GitHub OAuth app, provisioning KV,
 * and setting Cloudflare Worker secrets documented in README.
 */
import {validPrivateRef,validatePrivateMedia,storePrivateMedia,readPrivateMedia,deletePrivateMedia,privateKv} from "./private-kv-media.js";
import {readPrivateDraft,writePrivateDraft} from "./private-kv-draft.js";
import {appendRevision,readRevision,validRevisionId} from "./private-kv-revisions.js";
const REPO="chenofficial0/portfolio";
const CONTENT_PATH="content/site.json";
// Fail closed: this deployment must never write to the live Pages branch.
const CONTENT_BRANCH="feature/secure-content-studio-api";
const PUBLIC_STUDIO="https://chenofficial0.github.io/portfolio/admin/studio.html";
const GITHUB_API="https://api.github.com";
const utf8=new TextEncoder();
const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...extra}});
const fail=(msg,status=400)=>json({error:msg},status);
const b64=b=>{let binary="";for(let i=0;i<b.length;i+=8192)binary+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(binary)};
const random=()=>b64url(crypto.getRandomValues(new Uint8Array(32)));
const b64url=b=>b64(b).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const digest=async s=>b64url(new Uint8Array(await crypto.subtle.digest("SHA-256",utf8.encode(s))));
const cookie=(name,value,maxAge)=>name+"="+value+"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age="+maxAge;
const getCookie=(request,name)=>{
  const cookieHeader=request.headers.get("cookie")||"";
  const part=cookieHeader.split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="));
  return part?part.slice(name.length+1):"";
};
const absoluteBase=(request,env)=>{
  const configured=(env.PUBLIC_API_ORIGIN||"").replace(/\/+$/,"");
  const actual=new URL(request.url).origin;
  if(!configured||!configured.startsWith("https://")||actual!==configured)throw Error("API origin not configured or mismatched");
  return configured;
};
const headers={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"chen-content-studio"};
async function github(path,token,options={}){
  const response=await fetch(GITHUB_API+path,{
    ...options,
    headers:{...headers,Authorization:"Bearer "+token,...(options.headers||{})}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(Error("GitHub API error "+response.status),{http:response.status});
  return data;
}
async function key(env){
  const raw=Uint8Array.from(atob(env.SESSION_ENCRYPTION_KEY||""),c=>c.charCodeAt(0));
  if(raw.length!==32)throw Error("Missing AES-256 session encryption key");
  return crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt","decrypt"]);
}
async function encrypt(env,plain){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},await key(env),utf8.encode(JSON.stringify(plain))));
  return b64(iv)+"."+b64(data);
}
async function decrypt(env,encoded){
  const [iv,body]=String(encoded||"").split(".");
  if(!iv||!body)throw Error("Invalid session");
  const dec=await crypto.subtle.decrypt({name:"AES-GCM",iv:Uint8Array.from(atob(iv),c=>c.charCodeAt(0))},await key(env),Uint8Array.from(atob(body),c=>c.charCodeAt(0)));
  return JSON.parse(new TextDecoder().decode(dec));
}
async function session(request,env){
  const id=getCookie(request,"chen_session");
  if(!id||id.length>128)return null;
  const stored=await env.STUDIO_KV.get("session:"+await digest(id));
  if(!stored)return null;
  try{
    const s=await decrypt(env,stored);
    if(s.exp<Date.now()||s.login!=="chenofficial0")return null;
    return {id,...s};
  }catch(_){return null}
}
function requireWriteOrigin(request,env){
  return request.headers.get("origin")===env.PUBLIC_API_ORIGIN &&
    (request.headers.get("sec-fetch-site")==null || ["same-origin","none"].includes(request.headers.get("sec-fetch-site")));
}
function safeString(value,length=4000){return typeof value==="string"&&value.length<=length}
function validURL(value){
  if(!value)return true;
  if(!safeString(value,2048))return false;
  if(value.startsWith("private-media/"))return PRIVATE_MEDIA_REF.test(value);
  if(value.startsWith("private-kv/"))return validPrivateRef(value);
  if(value.startsWith("/portfolio/assets/uploads/")||value.startsWith("assets/uploads/"))return !value.includes("..");
  try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password}catch(_){return false}
}
function validate(d){
  if(!d||typeof d!=="object"||Array.isArray(d))return false;
  for(const k of ["about","profile","contact"]){if(!d[k]||typeof d[k]!=="object"||Array.isArray(d[k]))return false}
  if(!Array.isArray(d.works)||d.works.length>150||!Array.isArray(d.gallery)||d.gallery.length>200)return false;
  for(const group of [d.about,d.profile,d.contact,...d.works,...d.gallery]){
    if(!group||typeof group!=="object"||Array.isArray(group))return false;
    for(const [k,v] of Object.entries(group)){
      if(["hero_image","hero_image_secondary","photo","cover","image","model_card_pdf","resume_pdf","showreel_url","video_url","instagram","other_url"].includes(k)&&!validURL(v))return false;
      if(typeof v==="string"&&!safeString(v,12000))return false;
      if(Array.isArray(v)&&v.length>100)return false;
      if(v!==null&&typeof v==="object"&&!Array.isArray(v))return false;
    }
  }
  for(const w of d.works){
    if(!safeString(w.title_zh||"",300)||!Number.isInteger(Number(w.year))||Number(w.year)<1900||Number(w.year)>2200)return false;
    if(!["Film","Drama","Commercial","Music Video","Modeling","Other"].includes(w.category))return false;
    if(w.stills!==undefined&&(!Array.isArray(w.stills)||w.stills.length>40||w.stills.some(x=>!x||typeof x!=="object"||!validURL(x.image)||!safeString(x.caption||"",500))))return false;
  }
  if(d.about.languages!==undefined&&(!Array.isArray(d.about.languages)||d.about.languages.length>12||d.about.languages.some(x=>!safeString(x,90))))return false;
  if(d.about.hero_images!==undefined){
    if(!Array.isArray(d.about.hero_images)||d.about.hero_images.length>30)return false;
    for(const item of d.about.hero_images){
      if(!item||typeof item!=="object"||Array.isArray(item)||!safeString(item.image,2048)||!validURL(item.image))return false;
    }
  }
  for(const field of ["model_card_pdf_kind","resume_pdf_kind","showreel_url_kind"]){
    if(d.profile[field]!==undefined&&!["url","pdf","jpg","png",""].includes(d.profile[field]))return false;
  }
  if(d.profile.links!==undefined){
    if(!Array.isArray(d.profile.links)||d.profile.links.length>30)return false;
    for(const item of d.profile.links){
      if(item.kind!==undefined&&!["url","pdf","jpg","png"].includes(item.kind))return false;
      if(!item||typeof item!=="object"||Array.isArray(item)||!safeString(item.label,80)||!safeString(item.url,2048))return false;
      if(item.url&&!item.url.startsWith("https://")&&!PRIVATE_MEDIA_REF.test(item.url)&&!validPrivateRef(item.url))return false;
      if(item.url&&!validURL(item.url))return false;
    }
  }
  if(d.contact.links!==undefined){
    if(!Array.isArray(d.contact.links)||d.contact.links.length>30)return false;
    for(const item of d.contact.links){
      if(!item||typeof item!=="object"||Array.isArray(item)||!safeString(item.label,80)||!safeString(item.url,2048))return false;
      if(item.url&&!validURL(item.url))return false;
      if(item.url&&!item.url.startsWith("https://"))return false;
    }
  }
  return true;
}
async function auth(request,env){
  const base=absoluteBase(request,env);
  const state=random();
  await env.STUDIO_KV.put("oauth:"+await digest(state),"1",{expirationTtl:600});
  const authURL=new URL("https://github.com/login/oauth/authorize");
  authURL.searchParams.set("client_id",env.GITHUB_CLIENT_ID);
  authURL.searchParams.set("redirect_uri",base+"/auth/callback");
  authURL.searchParams.set("scope","public_repo read:user");
  authURL.searchParams.set("state",state);
  const r=new Response(null,{status:302,headers:{Location:authURL.toString()}});
  r.headers.set("Set-Cookie",cookie("chen_oauth_state",state,600));
  r.headers.set("Cache-Control","no-store");
  return r;
}
async function callback(request,env){
  const base=absoluteBase(request,env);
  const url=new URL(request.url),state=url.searchParams.get("state")||"",expected=getCookie(request,"chen_oauth_state");
  if(!state||state!==expected||!url.searchParams.get("code"))return fail("Invalid OAuth state",403);
  const stateKey="oauth:"+await digest(state);
  if(!await env.STUDIO_KV.get(stateKey))return fail("OAuth state expired",403);
  await env.STUDIO_KV.delete(stateKey);
  const tokenResponse=await fetch("https://github.com/login/oauth/access_token",{
    method:"POST",headers:{"content-type":"application/json","accept":"application/json"},
    body:JSON.stringify({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code:url.searchParams.get("code"),redirect_uri:base+"/auth/callback"})
  });
  const t=await tokenResponse.json();
  if(!tokenResponse.ok||!t.access_token||t.error)return fail("GitHub authorization unsuccessful",403);
  const user=await github("/user",t.access_token);
  if(user.login!=="chenofficial0")return fail("This GitHub account is not an approved editor",403);
  // Also verify a real write-capable token; no relying solely on matching login.
  const repo=await github("/repos/"+REPO,t.access_token);
  if(!repo.permissions?.push)return fail("GitHub repository write permission missing",403);
  const sid=random(),csrf=random();
  const info={login:user.login,csrf,token:t.access_token,exp:Date.now()+6*3600*1000};
  await env.STUDIO_KV.put("session:"+await digest(sid),await encrypt(env,info),{expirationTtl:6*3600});
  const r=new Response(null,{status:302,headers:{Location:base+"/studio"}});
  r.headers.append("Set-Cookie",cookie("chen_session",sid,21600));
  r.headers.append("Set-Cookie",cookie("chen_oauth_state","",0));
  r.headers.set("Cache-Control","no-store");
  return r;
}
async function getContent(session,env){
  if(env.ENABLE_PRIVATE_DRAFTS==="true"){
    try{
      const draft=await readPrivateDraft(env);
      if(!draft)return fail("Private draft has not been migrated; no public fallback",503);
      if(!validate(draft.data))return fail("Private draft validation failed",503);
      return json(draft);
    }catch(_){return fail("Private draft storage unavailable",503)}
  }
  const raw=await github("/repos/"+REPO+"/contents/"+CONTENT_PATH+"?ref="+encodeURIComponent(CONTENT_BRANCH),session.token);
  if(!raw.content||!raw.sha)return fail("Missing website content",502);
  const text=new TextDecoder().decode(Uint8Array.from(atob(raw.content.replace(/\s/g,"")),c=>c.charCodeAt(0)));
  return json({data:JSON.parse(text),sha:raw.sha});
}
async function saveContent(request,session,env){
  if(env.ENABLE_DRAFT_SAVES!=="true")return fail("Draft saves are disabled until reviewed",403);
  if(request.headers.get("x-chen-csrf")!==session.csrf)return fail("Invalid CSRF token",403);
  const length=Number(request.headers.get("content-length")||0);
  if(length>262144)return fail("Payload too large",413);
  const raw=await request.text();if(raw.length>262144)return fail("Payload too large",413);
  let input;try{input=JSON.parse(raw)}catch(_){return fail("Invalid JSON")}
  if(!input||!safeString(input.sha,80)||!validate(input.data))return fail("Content validation failed",422);
  // With the new gallery present, legacy hero fields must not leak into
  // saved drafts or a future production publish.
  if(Array.isArray(input.data.about.hero_images)){
    delete input.data.about.hero_image;
    delete input.data.about.hero_image_secondary;
  }
  if(env.ENABLE_PRIVATE_DRAFTS==="true"){
    // Mutable KV CAS is not atomic. Never allow this legacy write path to overwrite a private draft.
    return fail("Mutable private draft writes are locked; use reviewed immutable revision workflow",403);
    /* Archived migration prototype (deliberately unreachable):
    try{
      const result=await writePrivateDraft(env,{data:input.data,expectedSha:input.sha,validate});
      return json(result);
    }catch(err){
      if(err.message==="PRIVATE_DRAFT_STALE")return fail("Private draft changed; reload before saving",409);
      if(err.message==="PRIVATE_DRAFT_TOO_LARGE")return fail("Private draft too large",413);
      if(err.message==="PRIVATE_DRAFT_INVALID")return fail("Invalid private draft",422);
      return fail("Private draft storage unavailable; no GitHub fallback",503);
    }
    */
  }
  const encoded=b64(utf8.encode(JSON.stringify(input.data,null,2)+"\n"));
  try{
    const response=await github("/repos/"+REPO+"/contents/"+CONTENT_PATH,session.token,{
      method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        message:"Save CHEN. Content Studio draft (not live)",
        content:encoded,sha:input.sha,branch:CONTENT_BRANCH
      })
    });
    return json({ok:true,sha:response.content?.sha||null,commit:response.commit?.sha||null});
  }catch(e){return fail([409,422].includes(e.http)?"Website content may have changed; reload before publishing":"GitHub publish failed",[409,422].includes(e.http)?409:502)}
}

// Independent immutable revision endpoints. Opt-in only; no mutable draft save replacement.
async function getImmutableDraftRevision(request,env){
  if(env.ENABLE_IMMUTABLE_DRAFTS!=="true")return fail("Immutable draft history is not enabled",403);
  const id=new URL(request.url).searchParams.get("id");
  if(!validRevisionId(id))return fail("Invalid revision identifier",400);
  try{
    const revision=await readRevision(env,id,{validate});
    return revision?json({data:revision.data,sha:revision.id,parentId:revision.parentId,
      createdAt:revision.createdAt,immutable:true}):fail("Revision is unavailable",404);
  }catch(_){return fail("Private revision storage unavailable",503)}
}
async function appendImmutableDraftRevision(request,session,env){
  if(env.ENABLE_IMMUTABLE_DRAFTS!=="true"||env.ENABLE_DRAFT_SAVES!=="true")
    return fail("Immutable draft saves are not enabled",403);
  if(request.headers.get("x-chen-csrf")!==session.csrf)return fail("Invalid CSRF token",403);
  if(Number(request.headers.get("content-length")||0)>262144)return fail("Revision payload too large",413);
  const raw=await request.text();
  if(raw.length>262144)return fail("Revision payload too large",413);
  let input;try{input=JSON.parse(raw)}catch(_){return fail("Invalid revision request",400)}
  if(!input||!validate(input.data)||(input.parentId!==null&&!validRevisionId(input.parentId)))
    return fail("Invalid revision content or parent",422);
  try{return json(await appendRevision(env,{data:input.data,parentId:input.parentId,validate}),201)}
  catch(err){
    if(err.message==="REVISION_INVALID"||err.message==="INVALID_PARENT_REVISION")return fail("Invalid draft revision",422);
    if(err.message==="REVISION_TOO_LARGE")return fail("Draft exceeds storage limit",413);
    if(err.message==="PARENT_REVISION_UNAVAILABLE")return fail("Parent revision is unavailable; no data saved",409);
    return fail("Private revision storage unavailable",503);
  }
}
// New media stays in a private R2 bucket; absent binding must fail closed.
const PRIVATE_MEDIA_REF=/^private-media\/chen-(?:hero|profile|gallery|work-cover|work-still|resource)-\d{4}-\d{2}-\d{2}-[A-Za-z0-9_-]{16}\.(?:jpg|png|pdf)$/;
const privateBucket=env=>env.PRIVATE_MEDIA&&typeof env.PRIVATE_MEDIA.put==="function"&&typeof env.PRIVATE_MEDIA.get==="function"?env.PRIVATE_MEDIA:null;
const publicMediaPath=path=>path.replace(/^private-media\//,"assets/uploads/");
const VALID_UPLOAD_SCOPES=new Set(["hero","profile","gallery","work-cover","work-still"]);
function validatedJpeg(payload){
  if(!payload || typeof payload!=="object" || !VALID_UPLOAD_SCOPES.has(payload.scope) || payload.mime!=="image/jpeg" || typeof payload.base64!=="string")return null;
  // A 1.5 MiB upper limit for JPEGs already compressed in the browser.
  if(payload.base64.length<132 || payload.base64.length>2097152 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.base64))return null;
  let decoded;
  try{decoded=atob(payload.base64)}catch(_){return null}
  if(decoded.length<100 || decoded.length>1572864)return null;
  // Require a JPEG file signature and closing marker. Never accept SVG, HTML or arbitrary paths.
  if(decoded.charCodeAt(0)!==0xff || decoded.charCodeAt(1)!==0xd8 ||
     decoded.charCodeAt(decoded.length-2)!==0xff || decoded.charCodeAt(decoded.length-1)!==0xd9)return null;
  return {scope:payload.scope,base64:payload.base64};
}
async function uploadImage(request,session,env){
  // This permission is separate from content publishing and defaults to disabled.
  if(env.ENABLE_MEDIA_UPLOADS!=="true")return fail("Photo upload is disabled until reviewed",403);
  const bucket=privateBucket(env);
  if(!bucket)return fail("Private media storage is not configured",503);
  if(request.headers.get("x-chen-csrf")!==session.csrf)return fail("Invalid CSRF token",403);
  const size=Number(request.headers.get("content-length")||0);
  if(size>2200000)return fail("Upload too large",413);
  const raw=await request.text();
  if(raw.length>2200000)return fail("Upload too large",413);
  let parsed;try{parsed=JSON.parse(raw)}catch(_){return fail("Invalid upload JSON")}
  const photo=validatedJpeg(parsed);
  if(!photo)return fail("Only small JPEG photos are supported",422);
  const path="private-media/chen-"+photo.scope+"-"+new Date().toISOString().slice(0,10)+"-"+random().slice(0,16)+".jpg";
  try{
    const bytes=Uint8Array.from(atob(photo.base64),c=>c.charCodeAt(0));
    await bucket.put(path,bytes,{httpMetadata:{contentType:"image/jpeg"}});
    return json({ok:true,path,url:path,staging:true,private:true});
  }catch(_){return fail("Private media upload failed",502)}
}


const RESOURCE_REF=/^assets\/uploads\/chen-resource-\d{4}-\d{2}-\d{2}-[A-Za-z0-9_-]{16}\.(?:pdf|jpg|png)$/;
const RESOURCE_MAX_BYTES=4194304;
function mediaMime(path){return path.endsWith(".pdf")?"application/pdf":path.endsWith(".png")?"image/png":"image/jpeg"}
function validMediaBytes(path,bytes){
  if(!bytes||bytes.length<100||bytes.length>((RESOURCE_REF.test(path)||PRIVATE_MEDIA_REF.test(path)&&path.includes("chen-resource-"))?RESOURCE_MAX_BYTES:1572864))return false;
  if(path.endsWith(".jpg"))return bytes[0]===255&&bytes[1]===216&&bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217;
  if(path.endsWith(".png")){
    const h=[137,80,78,71,13,10,26,10],e=[73,69,78,68,174,66,96,130];
    return h.every((n,i)=>bytes[i]===n)&&e.every((n,i)=>bytes[bytes.length-8+i]===n);
  }
  if(path.endsWith(".pdf")){
    const head=String.fromCharCode(...bytes.slice(0,5));
    const tail=new TextDecoder("latin1").decode(bytes.slice(-1024));
    return head==="%PDF-"&&tail.includes("%%EOF");
  }
  return false;
}
async function uploadResource(request,session,env){
  if(env.ENABLE_MEDIA_UPLOADS!=="true")return fail("File uploads disabled",403);
  const bucket=privateBucket(env);
  if(!bucket)return fail("Private media storage is not configured",503);
  if(request.headers.get("x-chen-csrf")!==session.csrf)return fail("Invalid CSRF token",403);
  if(Number(request.headers.get("content-length")||0)>5700000)return fail("Upload too large",413);
  const raw=await request.text();if(raw.length>5700000)return fail("Upload too large",413);
  let data;try{data=JSON.parse(raw)}catch(_){return fail("Invalid file request",400)}
  if(!data||!["application/pdf","image/jpeg","image/png"].includes(data.mime)||typeof data.base64!=="string"||data.base64.length>5592408||!/^[A-Za-z0-9+/]+={0,2}$/.test(data.base64))return fail("Only PDF, JPG and PNG files are supported",422);
  let bytes;
  try{bytes=Uint8Array.from(atob(data.base64),c=>c.charCodeAt(0))}catch(_){return fail("Invalid file encoding",422)}
  const ext={"application/pdf":"pdf","image/jpeg":"jpg","image/png":"png"}[data.mime];
  const path="private-media/chen-resource-"+new Date().toISOString().slice(0,10)+"-"+random().slice(0,16)+"."+ext;
  if(!validMediaBytes(path,bytes))return fail("File signature invalid or file exceeds 4 MB",422);
  try{
    await bucket.put(path,bytes,{httpMetadata:{contentType:data.mime}});
    return json({ok:true,path,url:path,staging:true,private:true,mime:data.mime});
  }catch(_){return fail("Private document upload failed",502)}
}
// Separate private KV upload path; disabled unless BOTH explicit flags are enabled.
// This KV inventory check is conservative, not an atomic concurrency-safe quota.
async function uploadPrivateKvImage(request,editor,env){
  if(env.ENABLE_MEDIA_UPLOADS!=="true"||env.ENABLE_KV_MEDIA_UPLOADS!=="true")
    return fail("Private KV media uploads are disabled until acceptance",403);
  if(request.headers.get("x-chen-csrf")!==editor.csrf)return fail("Invalid CSRF token",403);
  const kv=privateKv(env);
  if(!kv||typeof kv.list!=="function")return fail("Private KV inventory is not configured",503);
  if(Number(request.headers.get("content-length")||0)>1450000)return fail("Photo exceeds upload limit",413);
  const raw=await request.text();
  if(raw.length>1450000)return fail("Photo exceeds upload limit",413);
  let input;try{input=JSON.parse(raw)}catch(_){return fail("Invalid upload request",400)}
  if(!input||!VALID_UPLOAD_SCOPES.has(input.scope)||input.mime!=="image/jpeg"||
      typeof input.base64!=="string"||input.base64.length>1398104||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64))
    return fail("Only JPEG photos up to 1 MiB are accepted",422);
  let bytes;
  try{bytes=Uint8Array.from(atob(input.base64),c=>c.charCodeAt(0))}
  catch(_){return fail("Invalid photo encoding",422)}
  const path="private-kv/chen-"+input.scope+"-"+new Date().toISOString().slice(0,10)+"-"+random().slice(0,16)+".jpg";
  if(!validatePrivateMedia(path,bytes))return fail("Invalid JPEG or photo exceeds 1 MiB",422);
  // Reject unknown inventory metadata, unbounded pagination, or budget exhaustion.
  // Simultaneous requests can still race: this must be stress-tested before activation.
  let entries=0,total=0,cursor;
  try{
    for(let page=0;page<3;page++){
      const result=await kv.list({prefix:"private-kv/",limit:100,...(cursor?{cursor}:{})});
      if(!result||!Array.isArray(result.keys))throw Error("Invalid inventory");
      for(const item of result.keys){
        const size=item?.metadata?.bytes;
        if(!Number.isSafeInteger(size)||size<100||size>1048576)throw Error("Unverified media size");
        total+=size;entries++;
      }
      if(result.list_complete===true){cursor=null;break}
      if(!result.cursor||result.cursor===cursor)throw Error("Inventory pagination failed");
      cursor=result.cursor;
    }
    if(cursor)throw Error("Inventory exceeds review limit");
  }catch(_){return fail("Unable to verify private media inventory; upload blocked",503)}
  if(entries>=50||total+bytes.byteLength>50*1048576)
    return fail("Private media safety budget reached; upload blocked",413);
  try{
    await storePrivateMedia(env,path,bytes);
    return json({ok:true,path,url:path,staging:true,private:true,mime:"image/jpeg"});
  }catch(_){return fail("Private KV media upload unavailable",503)}
}
// Explicit deletion only. Never automatically delete an image merely because a draft reference was removed.
async function deletePrivateKvAsset(request,editor,env){
  if(env.ENABLE_KV_MEDIA_DELETES!=="true")return fail("Private media deletion is disabled until acceptance",403);
  if(request.headers.get("x-chen-csrf")!==editor.csrf)return fail("Invalid CSRF token",403);
  if(!privateKv(env))return fail("Private KV media storage is not configured",503);
  const body=await request.text();
  if(body.length>2048)return fail("Delete request too large",413);
  let input;try{input=JSON.parse(body)}catch(_){return fail("Invalid delete request",400)}
  if(!input||!validPrivateRef(input.path)||input.confirmation!=="DELETE_PRIVATE_MEDIA")
    return fail("Exact private media path and deletion confirmation required",422);
  // The existing public draft source remains in use until private draft migration is accepted.
  // Fail closed if content cannot be loaded or any text field still refers to this media.
  let draft;
  try{draft=env.ENABLE_PRIVATE_DRAFTS==="true"?await readPrivateDraft(env):await rawContent(editor,CONTENT_BRANCH)}catch(_){return fail("Unable to verify draft references",503)}
  if(!draft||!validate(draft.data))return fail("Unable to validate current draft",503);
  if(JSON.stringify(draft.data).includes(input.path))
    return fail("Photo is still referenced by a draft; remove its reference and save first",409);
  try{
    const result=await deletePrivateMedia(env,input.path);
    return json({accepted:result.accepted,globallyErased:false,
      note:"KV deletion can take time to propagate across regions. This does not remove Git history or external copies."});
  }catch(_){return fail("Private media deletion unavailable",503)}
}
const STAGED_IMAGE_PATH=/^assets\/uploads\/chen-(?:hero|profile|gallery|work-cover|work-still)-\d{4}-\d{2}-\d{2}-[A-Za-z0-9_-]{16}\.jpg$/;
async function readStagedAsset(session,relative,env){
  if(validPrivateRef(relative)){
    const asset=await readPrivateMedia(env,relative);
    if(!asset)throw Error("Private KV media not found");
    return {bytes:asset.bytes,private:true,kv:true};
  }
  if(PRIVATE_MEDIA_REF.test(relative)){
    const bucket=privateBucket(env);
    if(!bucket)throw Error("Private media storage unavailable");
    const object=await bucket.get(relative);
    if(!object)throw Error("Private media not found");
    const bytes=new Uint8Array(await object.arrayBuffer());
    if(!validMediaBytes(relative,bytes))throw Error("Invalid private media content");
    return {bytes,private:true};
  }
  if(!STAGED_IMAGE_PATH.test(relative)&&!RESOURCE_REF.test(relative))throw Error("Invalid staged path");
  const asset=await github("/repos/"+REPO+"/contents/"+relative+"?ref="+encodeURIComponent(CONTENT_BRANCH),session.token);
  const max=RESOURCE_REF.test(relative)?RESOURCE_MAX_BYTES:1572864;
  if(asset.type!=="file"||!asset.sha||!Number.isInteger(asset.size)||asset.size<100||asset.size>max)throw Error("Invalid staged media metadata");
  // GitHub Contents API may omit Base64 content for files larger than 1 MiB.
  const payload=asset.encoding==="base64"&&asset.content?asset:await github("/repos/"+REPO+"/git/blobs/"+asset.sha,session.token);
  if(payload.encoding!=="base64"||!payload.content)throw Error("Staged media blob unavailable");
  const decoded=atob(payload.content.replace(/\s/g,""));
  const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));
  if(bytes.length!==asset.size||!validMediaBytes(relative,bytes))throw Error("Invalid staged media content");
  return {sha:asset.sha,bytes};
}
async function previewStagedImage(request,session,env){
  const relative=new URL(request.url).searchParams.get("path")||"";
  if(!validPrivateRef(relative)&&!PRIVATE_MEDIA_REF.test(relative)&&!STAGED_IMAGE_PATH.test(relative)&&!RESOURCE_REF.test(relative))return fail("Invalid staged media path",400);
  try{
    const media=await readStagedAsset(session,relative,env);
    return new Response(media.bytes,{headers:{"content-type":mediaMime(relative),"cache-control":"private, no-store","x-content-type-options":"nosniff","content-disposition":"inline"}});
  }catch(_){return fail("Staged media unavailable or invalid",404)}
}


const IMAGE_URL_PREFIX="https://chenofficial0.github.io/portfolio/";
const IMAGE_REF=/^assets\/uploads\/chen-(?:hero|profile|gallery|work-cover|work-still)-\d{4}-\d{2}-\d{2}-[A-Za-z0-9_-]{16}\.jpg$/;
const PREVIEW_HTML="https://chenofficial0.github.io/portfolio/";
function stagedPath(value){
  if(typeof value!=="string")return null;
  if(PRIVATE_MEDIA_REF.test(value)||validPrivateRef(value))return value;
  if(!value.startsWith(IMAGE_URL_PREFIX))return null;
  const path=value.slice(IMAGE_URL_PREFIX.length);
  return IMAGE_REF.test(path)||RESOURCE_REF.test(path)?path:null;
}
function imageRefs(d){
  // New-format galleries are authoritative, including an intentionally empty list.
  // Fall back to the two legacy fields only for an older draft without hero_images.
  const hero=Array.isArray(d.about?.hero_images)
    ?d.about.hero_images.map(item=>item.image)
    :[d.about?.hero_image,d.about?.hero_image_secondary];
  const images=[...hero,d.profile?.photo,d.profile?.model_card_pdf,d.profile?.resume_pdf,d.profile?.showreel_url];
  for(const link of d.profile?.links||[])images.push(link.url);
  for(const w of d.works||[]){
    images.push(w.cover);
    for(const st of w.stills||[])images.push(st.image);
  }
  for(const g of d.gallery||[])images.push(g.image);
  return [...new Set(images.map(stagedPath).filter(Boolean))];
}
async function rawContent(session,branch){
  const raw=await github("/repos/"+REPO+"/contents/"+CONTENT_PATH+"?ref="+encodeURIComponent(branch),session.token);
  if(!raw.content||!raw.sha)return null;
  const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw.content.replace(/\s/g,"")),c=>c.charCodeAt(0))));
  return {sha:raw.sha,data};
}
async function getGitHead(session,branch){
  const ref=await github("/repos/"+REPO+"/git/ref/heads/"+encodeURIComponent(branch).replace(/%2F/gi,"/"),session.token);
  return ref.object.sha;
}
async function previewContent(session,env){
  let draft;
  if(env.ENABLE_PRIVATE_DRAFTS==="true"){
    try{draft=await readPrivateDraft(env)}catch(_){return fail("Private draft storage unavailable",503)}
  }else draft=await rawContent(session,CONTENT_BRANCH);
  if(!draft||!validate(draft.data))return fail("Draft data is unavailable or invalid",422);
  const data=JSON.parse(JSON.stringify(draft.data));
  const rewrite=value=>{
    const path=stagedPath(value);
    return path?"/api/media/preview?path="+encodeURIComponent(path):value;
  };
  if(Array.isArray(data.about.hero_images)){
    delete data.about.hero_image;
    delete data.about.hero_image_secondary;
    for(const item of data.about.hero_images)item.image=rewrite(item.image);
  }else{
    data.about.hero_image=rewrite(data.about.hero_image);
    data.about.hero_image_secondary=rewrite(data.about.hero_image_secondary);
  }
  data.profile.photo=rewrite(data.profile.photo);
  data.profile.model_card_pdf=rewrite(data.profile.model_card_pdf);
  data.profile.resume_pdf=rewrite(data.profile.resume_pdf);
  data.profile.showreel_url=rewrite(data.profile.showreel_url);
  for(const link of data.profile.links||[])link.url=rewrite(link.url);
  for(const w of data.works){
    w.cover=rewrite(w.cover);
    for(const st of w.stills||[])st.image=rewrite(st.image);
  }
  for(const g of data.gallery)g.image=rewrite(g.image);
  return json(data);
}
async function previewSite(){
  const upstream=await fetch(PREVIEW_HTML,{headers:{"cache-control":"no-cache"}});
  if(!upstream.ok)return fail("Public layout unavailable for preview",503);
  let html=await upstream.text();
  const source="fetch(new URL('content/site.json',document.baseURI),{cache:'no-store'})";
  if(!html.includes(source))return fail("Site preview is incompatible with this website version",503);
  html=html.replace(source,"fetch('/api/preview-content',{cache:'no-store',credentials:'same-origin'})");
  html=html.replace(/<meta name="robots" content="[^"]*">/,'<meta name="robots" content="noindex, nofollow">');
  html=html.replace(/<link rel="canonical" href="[^"]*">/,"");
  html=html.replace("<body>",'<body><div role="status" style="padding:12px 24px;background:#f5f5f2;color:#333;font-size:12px;border-bottom:1px solid #ddd;position:relative;z-index:100">CHEN. / 草稿預覽 — 尚未發布至正式網站　 <a href="/studio" style="text-decoration:underline">返回管理後台</a></div>');
  const nonce=random();
  html=html.replace(/<script(\s|>)/g,(_match,after)=>'<script nonce="'+nonce+'"'+after);
  html=html.replace(/<style(\s|>)/g,(_match,after)=>'<style nonce="'+nonce+'"'+after);
  return new Response(html,{headers:{
    "content-type":"text/html; charset=utf-8","cache-control":"no-store",
    "x-frame-options":"DENY","x-content-type-options":"nosniff",
    "content-security-policy":"default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'nonce-"+nonce+"'; style-src-attr 'unsafe-inline'; connect-src 'self'; img-src 'self' data: https:; font-src 'self'; frame-src https:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  }});
}
async function preparePublish(session,env){
  if(env.ENABLE_PRIVATE_DRAFTS==="true")return fail("Publishing private drafts is locked pending migration review",403);
  const [draft,live,stagingHead,mainHead]=await Promise.all([
    rawContent(session,CONTENT_BRANCH),rawContent(session,"main"),
    getGitHead(session,CONTENT_BRANCH),getGitHead(session,"main")
  ]);
  if(!draft||!live||!validate(draft.data))return fail("Content validation failed; correct draft before publishing",422);
  // Fail closed if an externally edited draft still has obsolete image URLs.
  if(Array.isArray(draft.data.about.hero_images)&&(draft.data.about.hero_image||draft.data.about.hero_image_secondary))
    return fail("Remove legacy hero photo fields from draft before publishing",422);
  const staged=imageRefs(draft.data);
  if(staged.some(validPrivateRef))return fail("Private KV media publishing is locked pending separate release acceptance",403);
  if(staged.length>120)return fail("Too many media files to publish at once",422);
  for(const path of staged){
    try{await readStagedAsset(session,path,env)}catch(_){return fail("Staged file is unavailable or invalid: "+path,422)}
  }
  const differences=["about","profile","works","gallery","contact"].filter(k=>JSON.stringify(draft.data[k])!==JSON.stringify(live.data[k]));
  const id=random();
  const plan={login:session.login,mainHead,stagingHead,draftSha:draft.sha,media:staged,sections:differences,exp:Date.now()+600000};
  await env.STUDIO_KV.put("release:"+await digest(id),JSON.stringify(plan),{expirationTtl:600});
  return json({planId:id,sections:differences,mediaCount:staged.length,media:staged,
    changed:JSON.stringify(draft.data)!==JSON.stringify(live.data),
    canPublish:env.ENABLE_LIVE_PUBLISH==="true",
    note:"Published files will be public. Review all photos and personal details before confirmation."});
}
async function confirmPublish(request,session,env){
  if(env.ENABLE_PRIVATE_DRAFTS==="true")return fail("Private draft publishing is not enabled",403);
  if(env.ENABLE_LIVE_PUBLISH!=="true")return fail("Live publishing has not been approved or enabled",403);
  if(request.headers.get("x-chen-csrf")!==session.csrf)return fail("Invalid CSRF token",403);
  const raw=await request.text();
  if(raw.length>3000)return fail("Invalid release request",413);
  let input;try{input=JSON.parse(raw)}catch(_){return fail("Invalid release request")}
  if(input?.confirmation!=="PUBLISH"||typeof input.planId!=="string"||input.planId.length>100)return fail("Confirmation required",422);
  const key="release:"+await digest(input.planId);
  const record=await env.STUDIO_KV.get(key);
  if(!record)return fail("Publish review expired; review again",409);
  const plan=JSON.parse(record);
  if(plan.login!==session.login||plan.exp<Date.now())return fail("Publish review expired or unauthorized",403);
  // Invalidate approval before writing; a retry must obtain a fresh review.
  await env.STUDIO_KV.delete(key);
  const [mainHead,stagingHead,draft]=await Promise.all([
    getGitHead(session,"main"),getGitHead(session,CONTENT_BRANCH),rawContent(session,CONTENT_BRANCH)
  ]);
  if(mainHead!==plan.mainHead||stagingHead!==plan.stagingHead||draft?.sha!==plan.draftSha)return fail("Site or draft changed; review latest contents again",409);
  if(!validate(draft.data))return fail("Draft validation failed",422);
  if(Array.isArray(draft.data.about.hero_images)&&(draft.data.about.hero_image||draft.data.about.hero_image_secondary))
    return fail("Remove legacy hero photo fields before publishing",422);
  const refs=imageRefs(draft.data);
  if(refs.some(validPrivateRef))return fail("Private KV media publishing has not been approved",403);
  if(refs.length!==plan.media.length||refs.some((p,i)=>p!==plan.media[i]))return fail("Image list changed; review again",409);
  const published=JSON.parse(JSON.stringify(draft.data));
  const replacePrivate=value=>PRIVATE_MEDIA_REF.test(value||"")?IMAGE_URL_PREFIX+publicMediaPath(value):value;
  const rewrite=(obj,fields)=>fields.forEach(key=>{if(typeof obj?.[key]==="string")obj[key]=replacePrivate(obj[key])});
  rewrite(published.about,["hero_image","hero_image_secondary"]);
  for(const h of published.about.hero_images||[])rewrite(h,["image"]);
  rewrite(published.profile,["photo","model_card_pdf","resume_pdf","showreel_url"]);
  for(const link of published.profile.links||[])rewrite(link,["url"]);
  for(const work of published.works){rewrite(work,["cover"]);for(const still of work.stills||[])rewrite(still,["image"])}
  for(const item of published.gallery)rewrite(item,["image"]);
  const mainCommit=await github("/repos/"+REPO+"/git/commits/"+mainHead,session.token);
  let contentSha=draft.sha;
  if(refs.some(path=>PRIVATE_MEDIA_REF.test(path))){
    const uploaded=await github("/repos/"+REPO+"/git/blobs",session.token,{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({content:JSON.stringify(published,null,2)+"\n",encoding:"utf-8"})
    });
    contentSha=uploaded.sha;
  }
  const changes=[{path:CONTENT_PATH,mode:"100644",type:"blob",sha:contentSha}];
  for(const path of refs){
    let asset;
    try{asset=await readStagedAsset(session,path,env)}catch(_){return fail("Staged file is unavailable or invalid: "+path,422)}
    let sha=asset.sha;
    if(asset.private){
      const blob=await github("/repos/"+REPO+"/git/blobs",session.token,{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({content:b64(asset.bytes),encoding:"base64"})
      });
      sha=blob.sha;
    }
    changes.push({path:asset.private?publicMediaPath(path):path,mode:"100644",type:"blob",sha});
  }
  const tree=await github("/repos/"+REPO+"/git/trees",session.token,{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({base_tree:mainCommit.tree.sha,tree:changes})
  });
  const commit=await github("/repos/"+REPO+"/git/commits",session.token,{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({message:"Publish approved CHEN. website content and photos",tree:tree.sha,parents:[mainHead]})
  });
  try{
    await github("/repos/"+REPO+"/git/refs/heads/main",session.token,{
      method:"PATCH",headers:{"content-type":"application/json"},
      body:JSON.stringify({sha:commit.sha,force:false})
    });
    return json({ok:true,commit:commit.sha,mediaCount:refs.length});
  }catch(err){return fail("Another update may have occurred; check GitHub before retrying",409)}
}

async function studio(env){
  const upstream=await fetch(PUBLIC_STUDIO,{headers:{"Cache-Control":"no-cache"}});
  if(!upstream.ok)return fail("Studio page has not deployed yet",503);
  const html=await upstream.text();
  // Hosted under the API's own origin, enabling same-site HttpOnly cookies.
  const nonce=random();
  const secured=html.replace(/<script>/g,'<script nonce="'+nonce+'">').replace(/<style>/g,'<style nonce="'+nonce+'">');
  return new Response(secured,{headers:{
    "content-type":"text/html; charset=utf-8","cache-control":"no-store",
    "x-frame-options":"DENY","x-content-type-options":"nosniff",
    "content-security-policy":"default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'nonce-"+nonce+"'; style-src-attr 'unsafe-inline'; connect-src 'self' https://chenofficial0.github.io https://raw.githubusercontent.com; img-src 'self' data: blob: https:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  }});
}
export default {
  async fetch(request,env){
    try{
      const url=new URL(request.url),path=url.pathname,method=request.method;
      absoluteBase(request,env);
      if(method==="GET"&&path==="/studio")return studio(env);
      if(method==="GET"&&path==="/")return Response.redirect(env.PUBLIC_API_ORIGIN+"/studio",302);
      if(method==="GET"&&path==="/auth/login")return auth(request,env);
      if(method==="GET"&&path==="/auth/callback")return callback(request,env);
      if(path==="/api/logout"&&method==="POST"){
        if(!requireWriteOrigin(request,env))return fail("Invalid origin",403);
        const s=await session(request,env);
        if(s && request.headers.get("x-chen-csrf")===s.csrf)await env.STUDIO_KV.delete("session:"+await digest(s.id));
        const r=json({ok:true});
        r.headers.append("set-cookie",cookie("chen_session","",0));return r;
      }
      const s=await session(request,env);
      if(method==="GET"&&path==="/api/session")return json(s?{authenticated:true,login:s.login,csrf:s.csrf,canPublish:env.ENABLE_LIVE_PUBLISH==="true",canSave:env.ENABLE_DRAFT_SAVES==="true",canUpload:env.ENABLE_MEDIA_UPLOADS==="true"}:{authenticated:false,canPublish:false,canSave:false,canUpload:false});
      if(!s)return fail("Sign in with approved GitHub account",401);
      if(method==="GET"&&path==="/api/content")return getContent(s,env);
      if(method==="GET"&&path==="/api/draft/revision")return getImmutableDraftRevision(request,env);
      if(method==="POST"&&path==="/api/draft/revision"){
        if(!requireWriteOrigin(request,env))return fail("Invalid origin",403);
        return appendImmutableDraftRevision(request,s,env);
      }
      if(method==="GET"&&path==="/preview")return previewSite();
      if(method==="GET"&&path==="/api/preview-content")return previewContent(s,env);
      if(method==="GET"&&path==="/api/publish/plan")return preparePublish(s,env);
      if(method==="POST"&&path==="/api/publish/confirm"){
        if(!requireWriteOrigin(request,env))return fail("Invalid origin",403);
        return confirmPublish(request,s,env);
      }
      if(method==="GET"&&path==="/api/media/preview")return previewStagedImage(request,s,env);
      if(method==="POST"&&path==="/api/media/private"){
        if(!requireWriteOrigin(request,env))return fail("Invalid origin",403);
        return uploadPrivateKvImage(request,s,env);
      }
      if(method==="DELETE"&&path==="/api/media/private"){
        if(!requireWriteOrigin(request,env))return fail("Invalid origin",403);
        return deletePrivateKvAsset(request,s,env);
      }
      if(method==="POST"&&path==="/api/media/resource"){
        if(!requireWriteOrigin(request,env))return fail("Invalid origin",403);
        return uploadResource(request,s,env);
      }
      if(method==="POST"&&path==="/api/media/image"){
        if(!requireWriteOrigin(request,env))return fail("Invalid origin",403);
        return uploadImage(request,s,env);
      }
      if(method==="PUT"&&path==="/api/content"){
        if(!requireWriteOrigin(request,env))return fail("Invalid origin",403);
        return saveContent(request,s,env);
      }
      return fail("Not found",404);
    }catch(err){
      return fail(err.message?.includes("API origin")?"API origin is not configured":"Service temporarily unavailable",503);
    }
  }
};