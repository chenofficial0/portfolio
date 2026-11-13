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

console.log("PASS: session flags, editor auth, wrong origin, missing CSRF, live publish disabled, media uploads disabled, anonymous reads denied.");
