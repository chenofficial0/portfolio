/**
 * CHEN. Content Studio trusted API (Cloudflare Worker).
 * No secrets or credentials belong in the public GitHub Pages repository.
 * Publish only after registering a GitHub OAuth app, provisioning KV,
 * and setting Cloudflare Worker secrets documented in README.
 */
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
      if(["hero_image","photo","cover","image","model_card_pdf","resume_pdf","showreel_url","video_url","instagram","other_url"].includes(k)&&!validURL(v))return false;
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
async function getContent(session){
  const raw=await github("/repos/"+REPO+"/contents/"+CONTENT_PATH+"?ref="+encodeURIComponent(CONTENT_BRANCH),session.token);
  if(!raw.content||!raw.sha)return fail("Missing website content",502);
  const text=new TextDecoder().decode(Uint8Array.from(atob(raw.content.replace(/\s/g,"")),c=>c.charCodeAt(0)));
  return json({data:JSON.parse(text),sha:raw.sha});
}
async function saveContent(request,session,env){
  if(env.ENABLE_CONTENT_WRITES!=="true")return fail("Content writes are disabled pending security approval",403);
  if(request.headers.get("x-chen-csrf")!==session.csrf)return fail("Invalid CSRF token",403);
  const length=Number(request.headers.get("content-length")||0);
  if(length>262144)return fail("Payload too large",413);
  const raw=await request.text();if(raw.length>262144)return fail("Payload too large",413);
  let input;try{input=JSON.parse(raw)}catch(_){return fail("Invalid JSON")}
  if(!input||!safeString(input.sha,80)||!validate(input.data))return fail("Content validation failed",422);
  const encoded=b64(utf8.encode(JSON.stringify(input.data,null,2)+"\n"));
  try{
    const response=await github("/repos/"+REPO+"/contents/"+CONTENT_PATH,session.token,{
      method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        message:"Update CHEN. website content via Content Studio",
        content:encoded,sha:input.sha,branch:CONTENT_BRANCH
      })
    });
    return json({ok:true,sha:response.content?.sha||null,commit:response.commit?.sha||null});
  }catch(e){return fail([409,422].includes(e.http)?"Website content may have changed; reload before publishing":"GitHub publish failed",[409,422].includes(e.http)?409:502)}
}

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
  if(request.headers.get("x-chen-csrf")!==session.csrf)return fail("Invalid CSRF token",403);
  const size=Number(request.headers.get("content-length")||0);
  if(size>2200000)return fail("Upload too large",413);
  const raw=await request.text();
  if(raw.length>2200000)return fail("Upload too large",413);
  let parsed;try{parsed=JSON.parse(raw)}catch(_){return fail("Invalid upload JSON")}
  const photo=validatedJpeg(parsed);
  if(!photo)return fail("Only small JPEG photos are supported",422);
  const path="assets/uploads/chen-"+photo.scope+"-"+new Date().toISOString().slice(0,10)+"-"+random().slice(0,16)+".jpg";
  try{
    const result=await github("/repos/"+REPO+"/contents/"+path,session.token,{
      method:"PUT",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({message:"Stage CHEN. photo for review",content:photo.base64,branch:CONTENT_BRANCH})
    });
    return json({ok:true,path,url:"https://chenofficial0.github.io/portfolio/"+path,
      staging:true,commit:result.commit?.sha||null});
  }catch(err){return fail("Unable to stage image to GitHub",err.http===403?403:502)}
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
      if(method==="GET"&&path==="/api/session")return json(s?{authenticated:true,login:s.login,csrf:s.csrf,canPublish:env.ENABLE_CONTENT_WRITES==="true",canUpload:env.ENABLE_MEDIA_UPLOADS==="true"}:{authenticated:false,canPublish:false,canUpload:false});
      if(!s)return fail("Sign in with approved GitHub account",401);
      if(method==="GET"&&path==="/api/content")return getContent(s);
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