import assert from "node:assert/strict";
import {
  validPrivateRef, validatePrivateMedia, mimeForPrivateMedia, privateKv,
  storePrivateMedia, readPrivateMedia, deletePrivateMedia, PRIVATE_KV_LIMITS
} from "./src/private-kv-media.js";

const blob = new Map();
const kv = {
  async put(k, v) { blob.set(k, Uint8Array.from(v)); },
  async get(k) { const b = blob.get(k); return b ? b.slice().buffer : null; },
  async delete(k) { blob.delete(k); }
};
const env = { PRIVATE_DRAFT_KV: kv };
const valid = "private-kv/chen-hero-2026-11-13-abcdefghijklmnop.jpg";
const resource = "private-kv/chen-resource-2026-11-13-abcdefghijklmnop.pdf";
const img = new Uint8Array(100).fill(1);
img.set([255,216], 0); img.set([255,217], 98);

assert.equal(validPrivateRef(valid), true);
assert.equal(validPrivateRef("private-kv/../secrets"), false);
assert.equal(validPrivateRef("private-media/chen-hero-2026-11-13-abcdefghijklmnop.jpg"), false);
assert.equal(validPrivateRef("private-kv/chen-hero-2026-11-13-abcdefghijklmnop.svg"), false);
assert.equal(mimeForPrivateMedia(valid), "image/jpeg");
assert.equal(validatePrivateMedia(valid, img), true);
assert.equal(validatePrivateMedia(valid, img.slice(0,99)), false);
assert.equal(validatePrivateMedia(valid, new Uint8Array(1048577)), false);
assert.equal(validatePrivateMedia(resource, img), false);
assert.equal(privateKv({}), null);
await assert.rejects(storePrivateMedia({}, valid, img), /PRIVATE_STORAGE_UNAVAILABLE/);
await assert.rejects(storePrivateMedia(env, "private-kv/../bad", img), /INVALID_PRIVATE_MEDIA/);
const stored = await storePrivateMedia(env, valid, img);
assert.equal(stored.bytes, 100);
assert.deepEqual((await readPrivateMedia(env, valid)).bytes, img);
const result = await deletePrivateMedia(env, valid);
assert.deepEqual(result, { accepted: true, globallyErased: false });
assert.equal(await readPrivateMedia(env, valid), null);
assert.equal(PRIVATE_KV_LIMITS.isAtomicAccountQuota, false);
console.log("PASS: isolated KV media adapter validation, fail-closed binding, roundtrip and deletion semantics.");
