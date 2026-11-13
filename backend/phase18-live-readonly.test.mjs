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

// The deployed icon must be crawlable as a raster image, not only linked in Git.
assert.match(html,/<title>姜翊 CHIANG YI \| CHEN\.official<\/title>/,
  "Site title does not match approved Google-facing branding");
assert.match(html,/<link rel="icon" type="image\/png" sizes="256x256" href="\.\/favicon\.png">/,
  "Approved favicon is not referenced in the page head");
assert.match(html,/<link rel="apple-touch-icon" href="\.\/favicon\.png">/,
  "Apple touch icon reference missing");
const icon=await get(publicOrigin+"favicon.png");
assert.equal(icon.status,200,"Deployed favicon PNG is not reachable");
assert.match(icon.headers.get("content-type")||"",/image\/png/,
  "Favicon content type must be PNG");
const png=Buffer.from(await icon.arrayBuffer());
assert.ok(png.length>200&&png.length<250000,"Unexpected favicon file size");
assert.equal(png.subarray(0,8).toString("hex"),"89504e470d0a1a0a",
  "Favicon does not have a PNG signature");
assert.equal(png.readUInt32BE(16),256,"Favicon PNG width must be 256px");
assert.equal(png.readUInt32BE(20),256,"Favicon PNG height must be 256px");
assert.match(html,/\.contact-email-action\{display:inline-flex;align-items:center;justify-content:center;/,
  "Multilingual email buttons lost centered alignment");
const robots=await get(publicOrigin+"robots.txt");
assert.equal(robots.status,200,"robots.txt unavailable");
assert.doesNotMatch(await robots.text(),/disallow:\s*\/portfolio\/favicon\.png/i,
  "Favicon path is blocked by robots.txt");

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
console.log("PASS: live portfolio SEO title, 256px raster favicon, apple icon, contact alignment, content JSON, and anonymous API protection.");
