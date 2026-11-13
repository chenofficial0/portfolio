// CHEN. Pre-migration audit of the isolated staging snapshot.
// Read-only; no GitHub writes, KV writes, uploads, deletes or network requests.
import assert from "node:assert/strict";
import {readFile,stat} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const site=JSON.parse(await readFile(path.join(root,"content/site.json"),"utf8"));
const origin="https://chenofficial0.github.io/portfolio/";
const pattern=/^assets\/uploads\/chen-(?:hero|profile|gallery|work-cover|work-still)-\d{4}-\d{2}-\d{2}-[A-Za-z0-9_-]{16}\.jpg$/;
const expected=new Set([
 "assets/uploads/chen-profile-2026-11-12-mragG3nnw0NgdAUw.jpg",
 "assets/uploads/chen-hero-2026-11-12-8tp6PGMB_zcRxazp.jpg"
]);
assert.ok(site&&typeof site==="object"&&site.about&&site.profile&&site.contact);
assert.ok(Array.isArray(site.works)&&Array.isArray(site.gallery));
const refs=[];
for(const entry of site.about.hero_images||[])refs.push(entry.image);
if(site.profile.photo)refs.push(site.profile.photo);
for(const work of site.works){
 if(work.cover)refs.push(work.cover);
 for(const still of work.stills||[])if(still.image)refs.push(still.image);
}
for(const photo of site.gallery)if(photo.image)refs.push(photo.image);
const local=refs.filter(url=>typeof url==="string"&&url.startsWith(origin)).map(url=>url.slice(origin.length));
assert.equal(local.length,2,"Expected exactly two currently referenced staging photos");
assert.deepEqual(new Set(local),expected,"Original test photos changed; migration requires explicit review");
for(const relative of local){
 assert.match(relative,pattern,"Unexpected media path");
 const filename=path.join(root,...relative.split("/"));
 const file=await readFile(filename);
 const info=await stat(filename);
 assert.equal(info.isFile(),true);
 assert.ok(file.length>=100,"Missing or truncated portrait");
 assert.equal(file[0],0xff,"JPEG signature missing");
 assert.equal(file[1],0xd8,"JPEG signature missing");
 assert.equal(file.at(-2),0xff,"JPEG closing marker missing");
 assert.equal(file.at(-1),0xd9,"JPEG closing marker missing");
}
console.log("PASS: read-only pre-migration audit confirms two original photo files and their references remain intact.");
