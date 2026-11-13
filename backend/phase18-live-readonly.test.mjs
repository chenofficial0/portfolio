// Phase 18 read-only baseline against current live endpoints.
// Never logs in, writes, deploys, deletes, or requests private content with credentials.
import assert from "node:assert/strict";
const publicOrigin="https://chenofficial0.github.io/portfolio/";
const workerOrigin="https://chen-content-studio-api.clyichen0312.workers.dev";
const get=async url=>{
  const res=await fetch(url,{method:"GET",redirect:"manual",
    headers:{"accept":"text/html,application/json"},
    signal:AbortSignal.timeout(15000)});
  return res;
};
const home=await get(publicOrigin);
assert.equal(home.status,200,"Public portfolio home unavailable");
assert.match(home.headers.get("content-type")||"",/text\/html/);
const html=await home.text();
assert.match(html,/CHEN|CHIANG YI/i,"Unexpected public portfolio HTML");

const content=await get(publicOrigin+"content/site.json");
assert.equal(content.status,200,"Published content JSON unavailable");
const site=await content.json();
assert.equal(typeof site,"object");
assert.ok(site.about&&site.profile,"Public content shape changed");
assert.ok(Array.isArray(site.works)&&Array.isArray(site.gallery));

const session=await get(workerOrigin+"/api/session");
assert.equal(session.status,200,"Live Content Studio session endpoint unavailable");
const anonymous=await session.json();
assert.equal(anonymous.authenticated,false,"Anonymous session unexpectedly authenticated");
assert.equal(anonymous.canPublish,false,"Anonymous session falsely advertises publish");

const privateApi=await get(workerOrigin+"/api/content");
assert.equal(privateApi.status,401,"Anonymous Content Studio draft unexpectedly readable");
console.log("PASS: public portfolio loads, public content structure exists, and live API rejects unauthenticated draft reads.");
