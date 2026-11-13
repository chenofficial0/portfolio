// Zero-cost migration regression tests (isolated branch; no live API calls).
// Run with: node backend/zero-cost-security.test.mjs
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import worker from "./src/worker.js";

const crypto = globalThis.crypto ?? webcrypto;
const origin = "https://studio-zero-cost.invalid";
const store = new Map();
const env = {
  PUBLIC_API_ORIGIN: origin,
  GITHUB_CLIENT_ID: "test-only",
  ENABLE_DRAFT_SAVES: "true",
  ENABLE_CONTENT_WRITES: "false",
  ENABLE_LIVE_PUBLISH: "false",
  ENABLE_MEDIA_UPLOADS: "false",
  STUDIO_KV: {
    get: async key => store.get(key) ?? null,
    put: async (key, value) => { store.set(key, value); },
    delete: async key => { store.delete(key); }
  }
};
const keyBytes = crypto.getRandomValues(new Uint8Array(32));
env.SESSION_ENCRYPTION_KEY = Buffer.from(keyBytes).toString("base64");
const iv = crypto.getRandomValues(new Uint8Array(12));
const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
const editorSession = {
  login: "chenofficial0", csrf: "test-csrf-only",
  token: "DUMMY_NOT_A_REAL_TOKEN", exp: Date.now() + 60000
};
const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key,
  new TextEncoder().encode(JSON.stringify(editorSession)));
const sid = "test-session-only";
const hash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sid))).toString("base64url");
store.set("session:" + hash, Buffer.from(iv).toString("base64") + "." + Buffer.from(encrypted).toString("base64"));

async function request(path, method = "GET", headers = {}, body) {
  return worker.fetch(new Request(origin + path, {
    method,
    headers: { cookie: "chen_session=" + sid, ...headers },
    ...(body === undefined ? {} : { body })
  }), env);
}
const sameOrigin = { origin };

assert.equal((await request("/api/session")).status, 200);
const active = await (await request("/api/session")).json();
assert.equal(active.authenticated, true);
assert.equal(active.canPublish, false);
assert.equal(active.canSave, true);
assert.equal(active.canUpload, false);
assert.equal("token" in active, false);

const wrongOrigin = await request("/api/content", "PUT", { origin: "https://untrusted.invalid" }, "{}");
assert.equal(wrongOrigin.status, 403);
const noCsrf = await request("/api/content", "PUT", sameOrigin, "{}");
assert.equal(noCsrf.status, 403);
assert.match((await noCsrf.json()).error, /CSRF/i);

const noPublish = await request("/api/publish/confirm", "POST",
  { ...sameOrigin, "x-chen-csrf": "test-csrf-only" }, "{}");
assert.equal(noPublish.status, 403);
assert.match((await noPublish.json()).error, /not been approved|not enabled/i);

const noUpload = await request("/api/media/image", "POST",
  { ...sameOrigin, "x-chen-csrf": "test-csrf-only" }, "{}");
assert.equal(noUpload.status, 403);
assert.match((await noUpload.json()).error, /disabled/i);

assert.equal((await worker.fetch(new Request(origin + "/api/content"), env)).status, 401);
assert.equal((await worker.fetch(new Request(origin + "/api/preview-content"), env)).status, 401);
assert.equal((await worker.fetch(new Request(origin + "/api/media/preview"), env)).status, 401);

// Newly added KV uploads are disabled by default, even with an authenticated session.
const deniedPrivateUpload = await request("/api/media/private", "POST",
  {origin, "x-chen-csrf":"test-csrf-only", "content-type":"application/json"}, "{}");
assert.equal(deniedPrivateUpload.status, 403);
assert.match((await deniedPrivateUpload.json()).error, /disabled/i);

// Deletion always fails closed until a separate opt-in flag is reviewed.
const deniedDelete = await request("/api/media/private", "DELETE",
  { origin, "x-chen-csrf": "test-csrf-only", "content-type": "application/json" },
  JSON.stringify({path:"private-kv/chen-hero-2026-11-13-abcdefghijklmnop.jpg",confirmation:"DELETE_PRIVATE_MEDIA"}));
assert.equal(deniedDelete.status, 403);
assert.match((await deniedDelete.json()).error, /disabled/i);
assert.equal((await request("/api/media/private", "DELETE", {origin:"https://untrusted.invalid"}, "{}")).status,403);

// Private KV media preview is read-only and authenticated; no public GitHub call.
const image = new Uint8Array(100).fill(1);
image.set([255, 216], 0); image.set([255, 217], 98);
const privatePath = "private-kv/chen-hero-2026-11-13-abcdefghijklmnop.jpg";
env.PRIVATE_DRAFT_KV = {
  get: async (key, format) => key === privatePath && format === "arrayBuffer" ? image.slice().buffer : null,
  put: async () => { throw Error("Read-only test must not write"); },
  delete: async () => { throw Error("Read-only test must not delete"); }
};
const previewUrl = "/api/media/preview?path=" + encodeURIComponent(privatePath);
const preview = await request(previewUrl);
assert.equal(preview.status, 200);
assert.equal(preview.headers.get("cache-control"), "private, no-store");
assert.equal(preview.headers.get("content-type"), "image/jpeg");
assert.deepEqual(new Uint8Array(await preview.arrayBuffer()), image);
assert.equal((await worker.fetch(new Request(origin + previewUrl), env)).status, 401);
assert.equal((await request("/api/media/preview?path=private-kv%2F..%2Fbad")).status, 400);
delete env.PRIVATE_DRAFT_KV;
assert.equal((await request(previewUrl)).status, 404);

// Opted-in private draft mode must NEVER fall back to public GitHub on missing storage.
env.ENABLE_PRIVATE_DRAFTS = "true";
assert.equal((await request("/api/content")).status, 503);
assert.equal((await request("/api/preview-content")).status, 503);
assert.equal((await request("/api/publish/plan")).status, 403);
assert.equal((await request("/api/publish/confirm","POST",
  {origin, "x-chen-csrf":"test-csrf-only"},"{}")).status,403);
assert.equal((await request("/api/content","PUT",
  {origin,"x-chen-csrf":"test-csrf-only","content-type":"application/json"},"{}")).status,422);
delete env.ENABLE_PRIVATE_DRAFTS;
// Explicitly enabled only inside isolated tests: origin and CSRF still block writes.
env.ENABLE_IMMUTABLE_DRAFTS="true";
assert.equal((await request("/api/draft/revision","POST",
  {origin,"content-type":"application/json"},
  JSON.stringify({parentId:null,data:{}}))).status,403);
assert.equal((await request("/api/draft/revision","POST",
  {origin:"https://untrusted.invalid","x-chen-csrf":"test-csrf-only"},
  JSON.stringify({parentId:null,data:{}}))).status,403);
assert.equal((await request("/api/draft/revision?id=bad")).status,400);
delete env.ENABLE_IMMUTABLE_DRAFTS;

// Immutable history has its own disabled-by-default gate.
assert.equal((await request("/api/draft/revision?id=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).status,403);
assert.equal((await request("/api/draft/revision","POST",
  {origin,"x-chen-csrf":"test-csrf-only","content-type":"application/json"},
  JSON.stringify({parentId:null,data:{}}))).status,403);
assert.equal((await worker.fetch(new Request(origin+"/api/draft/revision?id=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),env)).status,401);
console.log("PASS: session flags, editor auth, wrong origin, missing CSRF, live publish disabled, media uploads disabled, anonymous reads denied.");
