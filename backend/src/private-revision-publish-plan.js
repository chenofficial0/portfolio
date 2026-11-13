// CHEN. Pure, read-only publish plan for immutable private draft revisions.
// No GitHub commits, KV writes, photo publication or release-side effects.
// A plan is NOT approval: every private image would become publicly accessible.
const PRIVATE_MEDIA=/^private-kv\/chen-(?:hero|profile|gallery|work-cover|work-still|resource)-\d{4}-\d{2}-\d{2}-[A-Za-z0-9_-]{16}\.(?:jpg|png|pdf)$/;
const PUBLIC_MEDIA=/^assets\/uploads\/chen-(?:hero|profile|gallery|work-cover|work-still|resource)-\d{4}-\d{2}-\d{2}-[A-Za-z0-9_-]{16}\.(?:jpg|png|pdf)$/;
const PRIVATE_ANY=/^(?:private-kv\/|private-media\/)/;
export const PUBLIC_ORIGIN="https://chenofficial0.github.io/portfolio/";
const MEDIA_FIELDS=new Set(["hero_image","hero_image_secondary","photo","cover","image","model_card_pdf","resume_pdf"]);
const LINK_FIELDS=new Set(["showreel_url","video_url","instagram","other_url"]);
const obj=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const safeClone=x=>JSON.parse(JSON.stringify(x));
const encoding=new TextEncoder();
const digest=async data=>{
 const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",encoding.encode(JSON.stringify(data))));
 return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
};
function walk(current,path,mapping){
 if(Array.isArray(current))return current.map((v,i)=>walk(v,path+"/"+i,mapping));
 if(!obj(current))return current;
 const out={};
 for(const [k,v] of Object.entries(current)){
  if(["__proto__","constructor","prototype"].includes(k))throw Error("UNSAFE_CONTENT_KEY");
  const p=path+"/"+k.replace(/~/g,"~0").replace(/\//g,"~1");
  if(typeof v==="string"&&PRIVATE_ANY.test(v)){
   if(!MEDIA_FIELDS.has(k)&&!(k==="url"&&p.startsWith("/profile/links/")&&p.endsWith("/url"))&&!(k==="showreel_url"&&p==="/profile/showreel_url"))throw Error("PRIVATE_REF_IN_UNRECOGNIZED_FIELD");
   if(!PRIVATE_MEDIA.test(v))throw Error("INVALID_PRIVATE_MEDIA_REFERENCE");
   const target=PUBLIC_ORIGIN+v.replace(/^private-kv\//,"assets/uploads/");
   if(!PUBLIC_MEDIA.test(target.slice(PUBLIC_ORIGIN.length)))throw Error("INVALID_PUBLIC_MEDIA_DESTINATION");
   mapping.push({source:v,publicUrl:target,publicPath:target.slice(PUBLIC_ORIGIN.length),field:p});
   out[k]=target;
  }else if(typeof v==="string"&&MEDIA_FIELDS.has(k)&&v.startsWith("assets/uploads/")){
   if(!PUBLIC_MEDIA.test(v))throw Error("INVALID_STAGED_PUBLIC_REFERENCE");
   out[k]=PUBLIC_ORIGIN+v;
  }else{
   out[k]=walk(v,p,mapping);
  }
 }
 return out;
}
export async function planPrivateRevisionPublish({revisionId,data,liveData,validate}){
 if(typeof revisionId!=="string"||!/^[A-Za-z0-9_-]{32,64}$/.test(revisionId))
  throw Error("INVALID_PUBLISH_REVISION");
 if(typeof validate!=="function"||!validate(data)||!validate(liveData))
  throw Error("PUBLISH_CONTENT_INVALID");
 const mappings=[];
 const publicData=walk(safeClone(data),"",mappings);
 if(!validate(publicData))throw Error("PUBLISHED_CONTENT_INVALID");
 const unique=new Map();
 for(const entry of mappings){
  const found=unique.get(entry.source);
  if(found&&found.publicPath!==entry.publicPath)throw Error("DUPLICATE_MEDIA_DESTINATION");
  unique.set(entry.source,{source:entry.source,publicPath:entry.publicPath});
 }
 if(unique.size>120)throw Error("TOO_MANY_MEDIA_TO_PUBLISH");
 // Detect any private refs that survived the strict allowlisted field walker.
 const serialized=JSON.stringify(publicData);
 if(serialized.includes("private-kv/")||serialized.includes("private-media/"))
  throw Error("PRIVATE_REFERENCES_REMAIN");
 const sections=["about","profile","works","gallery","contact"].filter(
  key=>JSON.stringify(data[key])!==JSON.stringify(liveData[key]));
 return {
  revisionId,sourceDigest:await digest(data),
  publishedDigest:await digest(publicData),
  changedSections:sections,media:[...unique.values()],
  mediaReferences:mappings.length,willExposePrivateMedia:unique.size>0,
  explicitApprovalRequired:true,mayWrite:false,published:false,
  publicData
 };
}
