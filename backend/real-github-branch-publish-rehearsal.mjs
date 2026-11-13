// Run ONLY from the explicitly triggered isolated GitHub Actions workflow.
// Creates one test/chen-release-rehearsal-YYYYMMDD branch, publishes and rolls it back.
// Absolutely no mutations to GitHub 'main', Cloudflare, private KV or Workers.
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildPrivateMigrationBundle,EXPECTED_PUBLIC_ASSETS} from "./src/private-kv-migration-bundle.js";
import {planPrivateRevisionPublish} from "./src/private-revision-publish-plan.js";
import {prepareApprovedRelease,prepareRollback} from "./src/private-revision-publish-transaction.js";
import {makeGitHubPublishAdapter} from "./src/github-publish-adapter.js";

const repo="chenofficial0/portfolio",token=process.env.GITHUB_TOKEN;
const branch="test/chen-release-rehearsal-20261113";
if(!token||process.env.CHEN_TEST_BRANCH_ONLY!=="YES")throw Error("TEST_BRANCH_EXPLICIT_AUTH_REQUIRED");
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const base="https://api.github.com/repos/"+repo;
async function gh(p,{method="GET",body}={}){
 const r=await fetch(base+p,{method,headers:{
  Accept:"application/vnd.github+json",
  Authorization:"Bearer "+token,"X-GitHub-Api-Version":"2022-11-28",
  ...(body?{"Content-Type":"application/json"}:{})
 },...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 if(r.status===404)return null;
 if(!r.ok)throw Error("GITHUB_TEST_API_HTTP_"+r.status);
 return r.json();
}
const getMain=async()=>{
 const d=await gh("/git/ref/heads/main");
 if(!/^[0-9a-f]{40}$/.test(d?.object?.sha||""))throw Error("INVALID_MAIN_HEAD");
 return d.object.sha;
};
const initial=await getMain();
if(await gh("/git/ref/heads/"+branch)!==null)
 throw Error("TEST_BRANCH_ALREADY_EXISTS_REFUSE_REUSE");
const source=JSON.parse(await readFile(path.join(root,"content/site.json"),"utf8"));
const assets=Object.fromEntries(await Promise.all(EXPECTED_PUBLIC_ASSETS.map(async s=>[
 s.path,await readFile(path.join(root,s.path))
])));
const revisionId="R".repeat(32);
const bundle=buildPrivateMigrationBundle(source,assets,{id:revisionId});
const rawLive=await gh("/contents/content/site.json?ref=main");
if(rawLive?.encoding!=="base64"||!rawLive.content)throw Error("LIVE_MAIN_CONTENT_UNAVAILABLE");
const live=JSON.parse(Buffer.from(rawLive.content,"base64").toString("utf8"));
const validate=x=>x&&typeof x==="object"&&x.about&&x.profile&&x.contact&&
 Array.isArray(x.works)&&Array.isArray(x.gallery);
const plan=await planPrivateRevisionPublish({
 revisionId,data:bundle.record.data,liveData:live,validate
});
if(plan.media.length!==2||!plan.willExposePrivateMedia)throw Error("UNEXPECTED_TEST_MEDIA");
const created=await gh("/git/refs",{method:"POST",body:{
 ref:"refs/heads/"+branch,sha:initial
}});
if(created?.object?.sha!==initial)throw Error("TEST_BRANCH_CREATE_UNCONFIRMED");
console.log("PASS: isolated publication rehearsal branch created; main base pinned.");
const adapter=makeGitHubPublishAdapter(token,{branch});
const pub=await prepareApprovedRelease({
 revisionId,data:bundle.record.data,liveData:live,validate,
 expectedSourceDigest:plan.sourceDigest,
 expectedPublishedDigest:plan.publishedDigest,
 expectedMainSha:initial,
 confirmation:"PUBLISH_APPROVED_PRIVATE_REVISION",adapter,
 loadPrivateMedia:async key=>bundle.media.find(x=>x.key===key)??null
});
if(pub.published!==true||pub.parentSha!==initial)throw Error("TEST_PUBLICATION_UNCONFIRMED");
if(await getMain()!==initial)throw Error("MAIN_CHANGED_DURING_TEST");
console.log("PASS: isolated branch publication commit verified; main unchanged.");
const rollback=await prepareRollback({
 publication:pub,confirmation:"RESTORE_PREVIOUS_PUBLIC_SITE",adapter
});
if(!rollback.restored||!rollback.historicalMediaMayRemainPublic)
 throw Error("TEST_ROLLBACK_UNCONFIRMED");
if(await adapter.getMainSha()!==rollback.rollbackSha)throw Error("TEST_BRANCH_HEAD_MISMATCH");
if(await getMain()!==initial)throw Error("MAIN_CHANGED_DURING_ROLLBACK");
console.log("PASS: history-safe rollback commit created on isolated test branch; main unchanged.");
