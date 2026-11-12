import {createClient} from "npm:@supabase/supabase-js@2.119.0";

/* BLACKCELL / Bunny -> Military Library private intake bridge.
 * "list": metadata-only reads of Bunny storage; reports staged originals.
 * "prepare": at owner's explicit request, copy ONE compatible <=32 MiB
 * photo/video to the already-private Supabase Military review bucket and
 * insert a PENDING, ADULT-RESTRICTED asset record.
 * No public posting, no Bunny delete/move, no external image analysis.
 * Key stays in Supabase Edge secrets. Owner + verified 2-code gate required.
 */
const zone="https://la.storage.bunnycdn.com/blackcell-media-vault/";
const bucket="corp-social-media";
const maxBytes=32*1024*1024;
const maxItems=180;
const accepted:Record<string,string>={
 jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",gif:"image/gif",
 webp:"image/webp",heic:"image/heic",mp4:"video/mp4",
 webm:"video/webm",mov:"video/quicktime",m4v:"video/x-m4v"
};
const mediaExtensions=new Set(["jpg","jpeg","png","gif","webp","heic","heif","avif","tif","tiff","bmp","mp4","mov","m4v","webm","avi","mkv","3gp"]);
const videoExtensions=new Set(["mp4","mov","m4v","webm","avi","mkv","3gp"]);
const origins=new Set(["https://blackcellcorp.com","https://www.blackcellcorp.com","https://pjs7zyw62m-del.github.io"]);
const cors=(origin:string|null):Record<string,string>=>({
 "Access-Control-Allow-Origin":origins.has(origin||"")?origin!:"https://blackcellcorp.com",
 "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
 "Access-Control-Allow-Methods":"POST,OPTIONS","Cache-Control":"no-store","Vary":"Origin"
});
const send=(payload:Record<string,unknown>,status:number,origin:string|null)=>
 new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json",...cors(origin)}});
const sha=async(s:string|ArrayBuffer)=>
 [...new Uint8Array(await crypto.subtle.digest("SHA-256",typeof s==="string"?new TextEncoder().encode(s):s))]
 .map(x=>x.toString(16).padStart(2,"0")).join("");
type Entry={ObjectName:string,IsDirectory:boolean,Length:number,ContentType?:string};
async function listing(secret:string,dir:string):Promise<Entry[]>{
 const r=await fetch(zone+dir,{
  method:"GET",headers:{"AccessKey":secret,"Accept":"application/json"},
  redirect:"error",signal:AbortSignal.timeout(18000)
 });
 if(r.status===404)return [];
 if(!r.ok)throw new Error("BUNNY_LIST_"+r.status);
 const data=await r.json();
 if(!Array.isArray(data))throw new Error("BUNNY_LIST_INVALID");
 if(data.length>15000)throw new Error("BUNNY_DIRECTORY_TOO_LARGE");
 return data.filter((x:unknown)=>typeof x==="object"&&x!==null&&
  typeof (x as Entry).ObjectName==="string") as Entry[];
}
function parts(key:string):{folder:string,name:string}|null{
 if(!key||key.length>350||key.startsWith("/")||key.includes("\\")||key.includes("..")||key.includes("%")||/[\u0000-\u001f]/.test(key))return null;
 const pieces=key.split("/");
 if(pieces.some(x=>!x||x==="."||x===".."))return null;
 if(pieces.length===1)return {folder:"",name:pieces[0]};
 if(pieces.length===3&&pieces[0]==="blackcell-intake"&&pieces[1]==="bulk")
  return {folder:"blackcell-intake/bulk/",name:pieces[2]};
 if(pieces.length===4&&pieces[0]==="blackcell-intake"&&pieces[1]==="bulk"&&/^[0-9a-f]{2}$/.test(pieces[2]))
  return {folder:"blackcell-intake/bulk/"+pieces[2]+"/",name:pieces[3]};
 return null;
}
function original(name:string){
 const clean=name.replace(/^[0-9a-f]{64}__/i,"");
 return clean.normalize("NFKC").replace(/[\u0000-\u001f]/g,"").slice(0,180)||"unnamed";
}
function fileMeta(key:string,length:number){
 const name=parts(key)?.name||"";
 const ext=name.split(".").at(-1)?.toLowerCase()||"";
 const mime=accepted[ext]||"";
 return {key,filename:original(name),bytes:Number(length)||0,
  kind:mediaExtensions.has(ext)?(videoExtensions.has(ext)?"video":"photo"):"unknown",
  supported:!!mime&&Number(length)>0&&Number(length)<=maxBytes,mime_type:mime};
}
function errorText(error:unknown){return error instanceof Error?error.message:"Unexpected storage error"}
Deno.serve(async req=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
 if(req.method!=="POST")return send({ok:false,code:"METHOD_NOT_ALLOWED"},405,origin);
 if(origin&&!origins.has(origin))return send({ok:false,code:"ORIGIN_NOT_ALLOWED"},403,origin);
 const header=req.headers.get("authorization")||"";
 if(!/^Bearer\s+\S+$/i.test(header))return send({ok:false,code:"UNAUTHORIZED"},401,origin);
 const jwt=header.replace(/^Bearer\s+/i,"").trim();
 const host=Deno.env.get("SUPABASE_URL")||"";
 const pub=Deno.env.get("SUPABASE_ANON_KEY")||
  (()=>{try{return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||""}catch{return ""}})();
 if(!host||!pub)return send({ok:false,code:"SUPABASE_AUTH_UNAVAILABLE"},503,origin);
 const db=createClient(host,pub,{
  global:{headers:{Authorization:"Bearer "+jwt}},
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
 });
 const auth=await db.auth.getUser(jwt);
 if(auth.error||!auth.data.user)return send({ok:false,code:"UNAUTHORIZED"},401,origin);
 const owner=auth.data.user.id;
 const {data:member,error:memberError}=await db.from("corp_access_members")
  .select("role,active,clearance_level").eq("user_id",owner).eq("active",true).maybeSingle();
 if(memberError||!member||member.role!=="owner"||Number(member.clearance_level)!==7)
  return send({ok:false,code:"OWNER_ONLY"},403,origin);
 const check=await db.rpc("corp_code_status");
 if(check.error||check.data?.ok!==true||check.data?.verified!==true)
  return send({ok:false,code:"SECURITY_SESSION_REQUIRED"},403,origin);
 const secret=Deno.env.get("BLACKCELL_BUNNY_STORAGE_ACCESS_KEY")?.trim()||"";
 if(!secret)return send({ok:false,code:"BUNNY_PASSWORD_MISSING"},503,origin);
 let payload:Record<string,unknown>;
 try{payload=await req.json()}catch(_){return send({ok:false,code:"BAD_JSON"},400,origin)}
 const action=payload.action;

 if(action==="list"){
  try{
   const [flat,root,existing]=await Promise.all([
    listing(secret,"blackcell-intake/bulk/"),
    listing(secret,""),
    db.from("corp_social_assets").select("storage_path,review_status")
     .eq("owner_id",owner).eq("source_provider","bunny-private")
     .limit(5000)
   ]);
   if(existing.error)throw new Error("LIBRARY_INDEX_"+existing.error.message);
   if((existing.data||[]).length===5000)throw new Error("LIBRARY_INDEX_TOO_LARGE");
   const imported=new Set((existing.data||[]).map(x=>x.storage_path));
   const candidates:{key:string,length:number}[]=[];
   for(const row of root)if(!row.IsDirectory&&parts(row.ObjectName))
    candidates.push({key:row.ObjectName,length:Number(row.Length)});
   for(const row of flat)if(!row.IsDirectory&&parts("blackcell-intake/bulk/"+row.ObjectName))
    candidates.push({key:"blackcell-intake/bulk/"+row.ObjectName,length:Number(row.Length)});
   const folders=flat.filter(x=>x.IsDirectory&&/^[0-9a-f]{2}\/?$/.test(x.ObjectName)).slice(0,256);
   // Legacy hash-prefix folders from the original Bunny uploader are read-only.
   for(const dir of folders){
    if(candidates.length>=maxItems+60)break;
    const prefix="blackcell-intake/bulk/"+dir.ObjectName.replace(/\/$/,"")+"/";
    const older=await listing(secret,prefix);
    for(const row of older)if(!row.IsDirectory&&parts(prefix+row.ObjectName))
      candidates.push({key:prefix+row.ObjectName,length:Number(row.Length)});
   }
   const outstanding:Record<string,unknown>[]=[];
   let truncated=false,seen=new Set<string>();
   for(const item of candidates){
    if(seen.has(item.key))continue;
    seen.add(item.key);
    const meta=fileMeta(item.key,item.length);
    if(meta.kind==="unknown")continue;
    const path=owner+"/bunny-review/"+await sha(item.key)+"."+item.key.split(".").at(-1)?.toLowerCase();
    if(imported.has(path))continue;
    if(outstanding.length>=maxItems){truncated=true;break}
    outstanding.push(meta);
   }
   return send({ok:true,code:"BUNNY_STAGING_LISTED",
    waiting:outstanding.length,truncated,items:outstanding,
    info:"Files stay in Bunny until the owner selects Prepare for Military Review. Nothing is published."},200,origin);
  }catch(error){
   return send({ok:false,code:"BUNNY_LIST_ERROR",detail:errorText(error).slice(0,180)},503,origin);
  }
 }
 if(action==="prepare"){
  const key=typeof payload.key==="string"?payload.key:"";
  const location=parts(key);
  if(!location)return send({ok:false,code:"UNSUPPORTED_BUNNY_PATH"},422,origin);
  try{
   const files=await listing(secret,location.folder);
   const matched=files.find(x=>!x.IsDirectory&&x.ObjectName===location.name);
   if(!matched)return send({ok:false,code:"BUNNY_FILE_NOT_FOUND"},404,origin);
   const meta=fileMeta(key,Number(matched.Length));
   if(!meta.supported)return send({ok:false,code:"FILE_NEEDS_LARGE_MEDIA_IMPORT",
    detail:"This original remains in Bunny. Only JPG, PNG, WebP, GIF, HEIC, MP4, MOV, M4V and WebM up to 32 MiB are supported for this review-copy step."},422,origin);
   const ext=location.name.split(".").at(-1)?.toLowerCase()||"";
   const dest=owner+"/bunny-review/"+await sha(key)+"."+ext;
   const prior=await db.from("corp_social_assets").select("id,review_status")
    .eq("storage_path",dest).eq("owner_id",owner).maybeSingle();
   if(prior.error)throw new Error("REGISTER_CHECK_"+prior.error.message);
   if(prior.data)return send({ok:true,registered:true,already:true,id:prior.data.id,
    review_status:prior.data.review_status,detail:"This Bunny original was already imported to the Military Library."},200,origin);

   const download=await fetch(zone+key.split("/").map(encodeURIComponent).join("/"),{
    method:"GET",headers:{"AccessKey":secret},
    redirect:"error",signal:AbortSignal.timeout(42000)
   });
   if(!download.ok)throw new Error("BUNNY_DOWNLOAD_"+download.status);
   const body=await download.arrayBuffer();
   if(body.byteLength!==meta.bytes||body.byteLength>maxBytes)
    return send({ok:false,code:"TRANSFER_SIZE_MISMATCH"},502,origin);
   const apparent=location.name.match(/^([0-9a-f]{64})__/);
   if(apparent&&await sha(body)!==apparent[1])
    return send({ok:false,code:"BUNNY_BYTES_HASH_MISMATCH"},502,origin);

   // Supabase copy is needed for the current Library's existing private
   // previews and approval workflow. Bunny original remains the main archive.
   const uploaded=await db.storage.from(bucket).upload(dest,new Uint8Array(body),{
    contentType:meta.mime_type,upsert:false,cacheControl:"3600"
   });
   if(uploaded.error&&!(/already exists|duplicate|409/i).test(uploaded.error.message))
    throw new Error("LIBRARY_PRIVATE_COPY_"+uploaded.error.message);

   const created=await db.from("corp_social_assets").insert({
    owner_id:owner,purpose:"library",kind:meta.kind,
    mime_type:meta.mime_type,filename:meta.filename,
    storage_path:dest,bytes:meta.bytes,review_status:"pending",
    adult_restricted:true,rights_confirmed:false,ages_confirmed:false,
    source_provider:"bunny-private",
    military_country_code:"",military_branch:"Unspecified",military_category:"Unsorted"
   }).select("id").single();
   if(created.error||!created.data){
    const again=await db.from("corp_social_assets").select("id")
     .eq("storage_path",dest).maybeSingle();
    if(again.data)return send({ok:true,registered:true,already:true,id:again.data.id},200,origin);
    throw new Error("MILITARY_REVIEW_RECORD_"+(created.error?.message||"missing record"));
   }
   return send({ok:true,registered:true,already:false,id:created.data.id,
    review_status:"pending",detail:"Copied into private Military Library review. Bunny original preserved; not published."},200,origin);
  }catch(error){
   return send({ok:false,code:"BUNNY_PREPARE_FAILED",
    detail:"The original remains untouched in Bunny. "+errorText(error).slice(0,170)},503,origin);
  }
 }
 return send({ok:false,code:"UNSUPPORTED_ACTION"},400,origin);
});
