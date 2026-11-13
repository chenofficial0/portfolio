// CHEN. GitHub Git Data adapter for explicitly reviewed publication.
// Never call automatically; Worker route stays disabled until release approval.
const REPO="chenofficial0/portfolio", ROOT="https://api.github.com/repos/"+REPO;
const SHA=/^[a-f0-9]{40}$/;
const headers={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"CHEN-Content-Studio"};
const b64=(bytes)=>{
 const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 let out="";for(let i=0;i<data.length;i+=8192)out+=String.fromCharCode(...data.subarray(i,i+8192));
 return btoa(out);
};
const sha=v=>{if(!SHA.test(v||""))throw Error("GITHUB_GIT_SHA_INVALID");return v};
export function makeGitHubPublishAdapter(token,{fetchImpl=fetch,branch="main"}={}){
 if(branch!=="main"&&!/^test\/chen-release-rehearsal-[0-9]{8}$/.test(branch))
  throw Error("GITHUB_RELEASE_BRANCH_NOT_ALLOWED");
 if(typeof token!=="string"||token.length<1)throw Error("GITHUB_TOKEN_UNAVAILABLE");
 const api=async(endpoint,{method="GET",body}={})=>{
  const res=await fetchImpl(ROOT+endpoint,{
   method,headers:{...headers,Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  if(!res.ok){
   if(res.status===404)return null;
   throw Error("GITHUB_REQUEST_FAILED_"+res.status);
  }
  return res.json();
 };
 return {
  async getMainSha(){
   const result=await api("/git/ref/heads/"+branch);
   return sha(result?.object?.sha);
  },
  async getMainTreeSha(commitSha){
   const c=await api("/git/commits/"+sha(commitSha));
   return sha(c?.tree?.sha);
  },
  async getPathSha(head,path){
   sha(head);
   if(!/^(?:assets\/uploads\/chen-[a-z-]+-\d{4}-\d{2}-\d{2}-[A-Za-z0-9_-]{16}\.(?:jpg|png|pdf))$/.test(path))
    throw Error("UNSAFE_PUBLIC_PATH");
   const response=await api("/contents/"+path+"?ref="+head);
   return response?sha(response.sha):null;
  },
  async createBlob(bytes,encoding){
   if(!["base64","utf-8"].includes(encoding))throw Error("UNSAFE_GIT_BLOB_ENCODING");
   const input=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
   if(input.length>1048576*2)throw Error("GITHUB_BLOB_TOO_LARGE");
   const result=await api("/git/blobs",{method:"POST",body:{
    content:encoding==="base64"?b64(input):new TextDecoder().decode(input),
    encoding:encoding==="base64"?"base64":"utf-8"
   }});
   return sha(result?.sha);
  },
  async createTree(baseSha,entries){
   const tree=entries.map(e=>({
    path:e.path,mode:e.mode,type:e.type,sha:sha(e.sha)
   }));
   if(tree.some(e=>e.mode!=="100644"||e.type!=="blob"||
      (e.path!=="content/site.json"&&!/^assets\/uploads\/chen-[a-z-]+-\d{4}-\d{2}-\d{2}-[A-Za-z0-9_-]{16}\.(?:jpg|png|pdf)$/.test(e.path))))
      throw Error("UNSAFE_GIT_RELEASE_TREE");
   const result=await api("/git/trees",{method:"POST",body:{base_tree:sha(baseSha),tree}});
   return sha(result?.sha);
  },
  async createCommit({parentSha,treeSha,message}){
   if(typeof message!=="string"||message.length>200||!message.startsWith("Publish reviewed CHEN private revision ")&&
      message!=="Restore previous CHEN public site")throw Error("UNSAFE_GIT_COMMIT_MESSAGE");
   const result=await api("/git/commits",{method:"POST",body:{
    message,parents:[sha(parentSha)],tree:sha(treeSha)
   }});
   return sha(result?.sha);
  },
  async updateMainRef(commitSha,{force}={}){
   if(force!==false)throw Error("FORCE_PUSH_FORBIDDEN");
   const result=await api("/git/refs/heads/"+branch,{method:"PATCH",body:{sha:sha(commitSha),force:false}});
   return sha(result?.object?.sha);
  }
 };
}
