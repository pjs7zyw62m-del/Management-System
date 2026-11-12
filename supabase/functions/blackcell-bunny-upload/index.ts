import {createClient} from "npm:@supabase/supabase-js@2.119.0";

/*
 * BLACKCELL Bunny Phase 1: 32 MiB bounded upload via Supabase.
 * - Authenticated, verified Level 7 corporate owner only
 * - Bunny AccessKey never leaves this Edge Function
 * - Hash verified from actual request bytes before PUT
 * - Existing identical bytes deduped by SHA-256, even if filename differs
 * - Private staging only; no public pull-zone or catalog changes
 * - No delete actions and no updates to prior published assets
 * Larger media require a separate streaming / desktop transfer solution.
 */
const zone="https://la.storage.bunnycdn.com/blackcell-media-vault/";
const maxBytes=32*1024*1024;
const origins=new Set(["https://blackcellcorp.com","https://www.blackcellcorp.com","https://pjs7zyw62m-del.github.io"]);
const extensions=new Set(["jpg","jpeg","png","gif","webp","heic","heif","avif","tif","tiff","bmp","mp4","mov","m4v","webm","avi","mkv","3gp"]);
function cors(origin:string|null){
 return {
  "Access-Control-Allow-Origin":origins.has(origin||"")?origin!:"https://blackcellcorp.com",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info,x-bc-sha256,x-bc-size,x-bc-name,x-bc-mime",
  "Cache-Control":"no-store","Vary":"Origin"
 };
}
function send(body:Record<string,unknown>,status:number,origin:string|null){
 return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json",...cors(origin)}});
}
function toHex(a:ArrayBuffer){
 return Array.from(new Uint8Array(a),x=>x.toString(16).padStart(2,"0")).join("");
}
function safeName(encoded:string){
 let name="";
 try{name=decodeURIComponent(encoded)}catch(_){return ""}
 return name.split(/[\/\\]/).at(-1)?.normalize("NFKD")
  .replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]/g,"_")
  .replace(/^\.+/,"").slice(-95)||"";
}
async function folderEntries(accessKey:string,folder:string){
 const r=await fetch(zone+folder,{method:"GET",headers:{"AccessKey":accessKey,"Accept":"application/json"},redirect:"error",signal:AbortSignal.timeout(14000)});
 if(r.status===404)return [];
 if(!r.ok)throw new Error("BUNNY_DIRECTORY_"+r.status);
 const j=await r.json();
 if(!Array.isArray(j))throw new Error("BUNNY_DIRECTORY_INVALID_RESPONSE");
 return j.filter(x=>x&&x.IsDirectory!==true&&typeof x.ObjectName==="string");
}
Deno.serve(async req=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
 if(req.method!=="POST")return send({ok:false,code:"METHOD_NOT_ALLOWED"},405,origin);
 if(origin&&!origins.has(origin))return send({ok:false,code:"ORIGIN_NOT_ALLOWED"},403,origin);
 const authHeader=req.headers.get("authorization")||"";
 if(!/^Bearer\s+\S+$/i.test(authHeader))return send({ok:false,code:"UNAUTHORIZED"},401,origin);
 const jwt=authHeader.replace(/^Bearer\s+/i,"").trim();
 const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
 const pub=Deno.env.get("SUPABASE_ANON_KEY")||
 (()=>{try{return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||""}catch{return ""}})();
 if(!supabaseUrl||!pub)return send({ok:false,code:"SERVER_AUTH_UNAVAILABLE"},503,origin);
 const db=createClient(supabaseUrl,pub,{
  global:{headers:{Authorization:"Bearer "+jwt}},
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
 });
 const identity=await db.auth.getUser(jwt);
 if(identity.error||!identity.data.user)return send({ok:false,code:"UNAUTHORIZED"},401,origin);
 const {data:member,error:memberError}=await db.from("corp_access_members")
  .select("user_id,role,active,clearance_level")
  .eq("user_id",identity.data.user.id).eq("active",true).maybeSingle();
 if(memberError||!member||member.role!=="owner"||Number(member.clearance_level)!==7)
  return send({ok:false,code:"OWNER_ONLY"},403,origin);
 const verified=await db.rpc("corp_code_status");
 if(verified.error||verified.data?.ok!==true||verified.data?.verified!==true)
  return send({ok:false,code:"SECURITY_SESSION_REQUIRED",detail:"Verify your corporate access/security codes again."},403,origin);

 const hash=req.headers.get("x-bc-sha256")||"";
 const size=Number(req.headers.get("x-bc-size"));
 const filename=safeName(req.headers.get("x-bc-name")||"");
 const ext=filename.split(".").at(-1)?.toLowerCase()||"";
 if(!/^[a-f0-9]{64}$/.test(hash)||!Number.isSafeInteger(size)||size<=0||size>maxBytes||
    !filename||!extensions.has(ext))
  return send({ok:false,code:"FILE_NOT_ALLOWED",detail:"Choose a photo or video no larger than 32 MiB. This initial uploader has not been enabled for large videos."},422,origin);
 const declaredLength=req.headers.get("content-length");
 if(declaredLength!==null&&Number(declaredLength)!==size)
  return send({ok:false,code:"LENGTH_MISMATCH",detail:"The transmitted file size did not match the selection."},422,origin);
 const accessKey=Deno.env.get("BLACKCELL_BUNNY_STORAGE_ACCESS_KEY")?.trim()||"";
 if(!accessKey)return send({ok:false,code:"BUNNY_SECRET_MISSING"},503,origin);
 const folder="blackcell-intake/bulk/"+hash.slice(0,2)+"/";
 const prefix=hash+"__";
 try{
  // These requests do not read or modify existing Bunny files.
  const before=await folderEntries(accessKey,folder);
  const prior=before.find(x=>x.ObjectName.startsWith(prefix));
  if(prior){
   if(Number(prior.Length)!==size)return send({ok:false,code:"HASH_COLLISION_OR_SIZE_MISMATCH"},409,origin);
   return send({ok:true,stored:true,duplicate:true,verified:true,size,code:"EXISTING_MATCH"},200,origin);
  }

  // Bound memory; hash file bytes independently before accepting the PUT.
  const body=await req.arrayBuffer();
  if(body.byteLength!==size)return send({ok:false,code:"LENGTH_MISMATCH"},422,origin);
  if(toHex(await crypto.subtle.digest("SHA-256",body))!==hash)
   return send({ok:false,code:"CONTENT_HASH_MISMATCH"},422,origin);

  const remoteName=prefix+filename;
  const mime=req.headers.get("x-bc-mime")||"application/octet-stream";
  const safeMime=/^(image|video)\/[a-zA-Z0-9.+-]{1,55}$/.test(mime)?mime:"application/octet-stream";
  const result=await fetch(zone+folder+encodeURIComponent(remoteName),{
   method:"PUT",
   headers:{"AccessKey":accessKey,"Content-Type":safeMime},
   body:new Uint8Array(body),
   redirect:"error",
   signal:AbortSignal.timeout(105000)
  });
  if(!result.ok)return send({ok:false,code:"BUNNY_UPLOAD_REJECTED",http_status:result.status,
   detail:"Bunny rejected the file upload. No existing files were intentionally changed."},502,origin);
  // Recheck actual Bunny file length, not just HTTP PUT success.
  for(const delay of [0,500,1100,1800]){
   if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
   let entries=null;
   try{entries=await folderEntries(accessKey,folder)}catch(_){continue}
   const saved=entries.find(x=>x.ObjectName===remoteName);
   if(saved&&Number(saved.Length)===size){
    return send({ok:true,stored:true,verified:true,duplicate:false,
      size,code:"BUNNY_VERIFIED",detail:"Private file verified in Bunny storage. Not published."},200,origin);
   }
  }
  return send({ok:true,stored:true,verified:false,duplicate:false,size,
   code:"BUNNY_VERIFY_PENDING",detail:"Bunny accepted the upload but its file listing has not yet verified the stored length. Re-select the same file to check again."},202,origin);
 }catch(e){
  const code=String(e instanceof Error?e.message:e).slice(0,80);
  return send({ok:false,code:"UPLOAD_PROXY_FAILED",
   detail:"Secure Bunny upload could not be completed or verified ("+code+"). Retry the same file; existing matching media will be skipped."},503,origin);
 }
});
