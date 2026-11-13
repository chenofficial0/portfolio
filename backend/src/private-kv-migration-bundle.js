// CHEN. Offline builder for a strict two-photo private KV migration bundle.
// Safe for public CI: contains only existing staging content; no secret or network access.
import {createHash,randomBytes} from "node:crypto";

export const EXPECTED_PUBLIC_ASSETS=Object.freeze([
 {scope:"hero", path:"assets/uploads/chen-hero-2026-11-12-8tp6PGMB_zcRxazp.jpg",
  gitSha:"fec49dda689d2802e40f0992f5816a1a3e3c859a",bytes:96820},
 {scope:"profile",path:"assets/uploads/chen-profile-2026-11-12-mragG3nnw0NgdAUw.jpg",
  gitSha:"dfd3560967c359ea3af70074af56e3a8374c9afc",bytes:313809}
]);
export const PUBLIC_ORIGIN="https://chenofficial0.github.io/portfolio/";
export const MAX_PRIVATE_IMAGE_BYTES=1048576;
const isObject=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const sha256=x=>createHash("sha256").update(x).digest("hex");
const gitBlobSha=bytes=>createHash("sha1").update("blob "+bytes.length+"\0").update(bytes).digest("hex");
const ID=/^[A-Za-z0-9_-]{32,64}$/;
export function buildPrivateMigrationBundle(source,files,{id=randomBytes(24).toString("base64url")}={}){
 if(!ID.test(id))throw Error("INVALID_MIGRATION_REVISION_ID");
 if(!isObject(source)||!isObject(source.about)||!isObject(source.profile)||
    !isObject(source.contact)||!Array.isArray(source.works)||!Array.isArray(source.gallery))
    throw Error("INVALID_MIGRATION_SOURCE");
 if(source.works.length!==0||source.gallery.length!==0)
    throw Error("MIGRATION_SOURCE_HAS_UNREVIEWED_MEDIA");
 if(!Array.isArray(source.about.hero_images)||source.about.hero_images.length!==1)
    throw Error("MIGRATION_HERO_COUNT_CHANGED");
 if(!files||typeof files!=="object")throw Error("MIGRATION_FILES_MISSING");
 const data=JSON.parse(JSON.stringify(source));
 const replace=new Map();
 const media=[];
 for(const spec of EXPECTED_PUBLIC_ASSETS){
  const bytes=files[spec.path];
  if(!Buffer.isBuffer(bytes)||bytes.length!==spec.bytes||
     bytes.length>MAX_PRIVATE_IMAGE_BYTES||bytes[0]!==255||bytes[1]!==216||
     bytes.at(-2)!==255||bytes.at(-1)!==217)
      throw Error("MIGRATION_IMAGE_INVALID_"+spec.scope.toUpperCase());
  if(gitBlobSha(bytes)!==spec.gitSha)
      throw Error("MIGRATION_IMAGE_SHA_CHANGED_"+spec.scope.toUpperCase());
  const privateKey=spec.path.replace("assets/uploads/","private-kv/");
  replace.set(PUBLIC_ORIGIN+spec.path,privateKey);
  media.push({key:privateKey,bytes,metadata:{bytes:bytes.length,kind:"private-media-v1"},
    sha256:sha256(bytes)});
 }
 const heroBefore=data.about.hero_images[0]?.image;
 const profileBefore=data.profile.photo;
 if(heroBefore!==PUBLIC_ORIGIN+EXPECTED_PUBLIC_ASSETS[0].path||
    profileBefore!==PUBLIC_ORIGIN+EXPECTED_PUBLIC_ASSETS[1].path)
    throw Error("MIGRATION_SOURCE_PHOTO_REFERENCE_CHANGED");
 data.about.hero_images[0].image=replace.get(heroBefore);
 data.profile.photo=replace.get(profileBefore);
 const raw=JSON.stringify(data);
 if(Buffer.byteLength(raw)>192*1024)throw Error("MIGRATION_DRAFT_TOO_LARGE");
 const record={
  schema:1,id,parentId:null,sha:sha256(raw),
  createdAt:new Date().toISOString(),data
 };
 const key="draft-revision-v1/"+id;
 return {recordKey:key,record,recordText:JSON.stringify(record),media,
  sourceSha256:sha256(JSON.stringify(source))};
}
