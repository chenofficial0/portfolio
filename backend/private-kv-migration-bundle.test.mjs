import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildPrivateMigrationBundle,EXPECTED_PUBLIC_ASSETS,PUBLIC_ORIGIN}
 from "./src/private-kv-migration-bundle.js";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=JSON.parse(await readFile(path.join(root,"content/site.json"),"utf8"));
const files=Object.fromEntries(await Promise.all(EXPECTED_PUBLIC_ASSETS.map(async entry=>[
 entry.path,await readFile(path.join(root,entry.path))
])));
const out=buildPrivateMigrationBundle(source,files,{id:"M".repeat(32)});
assert.equal(out.media.length,2);
assert.equal(out.recordKey,"draft-revision-v1/"+"M".repeat(32));
assert.equal(out.record.parentId,null);
assert.match(out.record.sha,/^[0-9a-f]{64}$/);
assert.equal(out.record.data.about.hero_images[0].image,
  "private-kv/chen-hero-2026-11-12-8tp6PGMB_zcRxazp.jpg");
assert.equal(out.record.data.profile.photo,
  "private-kv/chen-profile-2026-11-12-mragG3nnw0NgdAUw.jpg");
assert.equal(source.profile.photo,PUBLIC_ORIGIN+EXPECTED_PUBLIC_ASSETS[1].path);
assert.ok(out.media.every(x=>x.bytes.length<=1048576&&x.metadata.bytes===x.bytes.length));
const record=JSON.parse(out.recordText);
assert.equal(record.sha,out.record.sha);
const altered=structuredClone(source);altered.profile.photo="https://example.org/altered.jpg";
assert.throws(()=>buildPrivateMigrationBundle(altered,files),/MIGRATION_SOURCE_PHOTO_REFERENCE_CHANGED/);
assert.throws(()=>buildPrivateMigrationBundle(source,{}),/MIGRATION_IMAGE_INVALID_HERO/);
const bytes={...files,[EXPECTED_PUBLIC_ASSETS[0].path]:Buffer.from(files[EXPECTED_PUBLIC_ASSETS[0].path])};
bytes[EXPECTED_PUBLIC_ASSETS[0].path][100]^=1;
assert.throws(()=>buildPrivateMigrationBundle(source,bytes),/MIGRATION_IMAGE_SHA_CHANGED_HERO/);
const unauthorized=structuredClone(source);unauthorized.works.push({title:"Unexpected"});
assert.throws(()=>buildPrivateMigrationBundle(unauthorized,files),/MIGRATION_SOURCE_HAS_UNREVIEWED_MEDIA/);
console.log("PASS: strict migration bundle verifies source content and two photo Git hashes, preserves originals and validates KV metadata.");
