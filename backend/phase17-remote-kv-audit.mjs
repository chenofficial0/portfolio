// Manual GitHub Actions only. Never print tokens, key names or response bodies.
import {auditCloudflareNamespace} from "./src/cloudflare-remote-kv-audit.js";
try{
 const audit=await auditCloudflareNamespace({
  token:process.env.CLOUDFLARE_API_TOKEN,
  account:process.env.CLOUDFLARE_ACCOUNT_ID
 });
 if(!audit.identityVerified||!audit.readOnly)throw Error("REMOTE_AUDIT_INVALID");
 console.log("PASS: the designated Cloudflare namespace was verified with read-only credentials.");
 if(!audit.readyForControlledMigration){
  console.error("BLOCKED: namespace not proven empty or inventory incomplete. No changes made.");
  process.exitCode=3;
 }else{
  console.log("PASS: remote inventory currently empty; this is not a cross-region atomic guarantee.");
 }
}catch(error){
 console.error("BLOCKED: remote audit failed: "+String(error.message).slice(0,100));
 process.exitCode=4;
}
