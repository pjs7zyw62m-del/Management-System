import { createClient } from "npm:@supabase/supabase-js@2.119.0";

/* BLACKCELL Military Library -> Bunny private archive
 * Authenticated and two-code verified Level 7 owner only.
 * Copies an EXISTING approved Library photo from protected Supabase Storage
 * into a flat private Bunny folder; verifies destination SHA256 before saving
 * the reference. Never deletes/moves source files or changes publication status.
 */
const bunnyZone = "https://la.storage.bunnycdn.com/blackcell-media-vault/";
const mediaBucket = "corp-social-media";
const maxFile = 32 * 1024 * 1024;
const allowedOrigins = new Set([
  "https://blackcellcorp.com",
  "https://www.blackcellcorp.com",
  "https://pjs7zyw62m-del.github.io"
]);
const mimeExt: Record<string,string> = {
  "image/jpeg": "jpeg", "image/png": "png",
  "image/gif": "gif", "image/webp": "webp", "image/heic": "heic"
};
const headersFor = (origin: string|null): Record<string,string> => ({
  "Access-Control-Allow-Origin": allowedOrigins.has(origin || "") ? origin! : "https://blackcellcorp.com",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
  "Cache-Control": "no-store",
  "Vary": "Origin"
});
const response = (body: Record<string, unknown>, status: number, origin: string|null) =>
  new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json",...headersFor(origin)}});
async function digest(bytes: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))]
    .map(n=>n.toString(16).padStart(2,"0")).join("");
}
async function readBunny(key: string, secret: string): Promise<ArrayBuffer|null> {
  const result = await fetch(bunnyZone+key,{
    method:"GET",headers:{AccessKey:secret},
    redirect:"error",signal:AbortSignal.timeout(60000)
  });
  if(result.status===404)return null;
  if(!result.ok)throw Error("BUNNY_READ_"+result.status);
  if(Number(result.headers.get("content-length")||0)>maxFile)
    throw Error("BUNNY_FILE_TOO_LARGE");
  const bytes=await result.arrayBuffer();
  if(bytes.byteLength>maxFile)throw Error("BUNNY_FILE_TOO_LARGE");
  return bytes;
}
async function writeBunny(key:string,secret:string,bytes:ArrayBuffer,mime:string) {
  const result=await fetch(bunnyZone+key,{
    method:"PUT",
    headers:{AccessKey:secret,"Content-Type":mime},
    body:bytes,redirect:"error",signal:AbortSignal.timeout(90000)
  });
  if(!result.ok)throw Error("BUNNY_WRITE_"+result.status);
}
const cleanError=(error:unknown)=>error instanceof Error?error.message.slice(0,120):"UNEXPECTED_SYNC_ERROR";

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headersFor(origin)});
  if(req.method!=="POST")return response({ok:false,code:"METHOD_NOT_ALLOWED"},405,origin);
  if(origin&&!allowedOrigins.has(origin))return response({ok:false,code:"ORIGIN_NOT_ALLOWED"},403,origin);
  const bearer=req.headers.get("authorization")||"";
  if(!/^Bearer\s+\S+$/i.test(bearer))
    return response({ok:false,code:"SIGN_IN_REQUIRED"},401,origin);
  const jwt=bearer.replace(/^Bearer\s+/i,"").trim();
  const url=Deno.env.get("SUPABASE_URL")||"";
  const publishable=Deno.env.get("SUPABASE_ANON_KEY")||
    (()=>{try{return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||""}catch{return ""}})();
  if(!url||!publishable)return response({ok:false,code:"SUPABASE_AUTH_UNAVAILABLE"},503,origin);
  const db=createClient(url,publishable,{
    global:{headers:{Authorization:"Bearer "+jwt}},
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
  });
  const identity=await db.auth.getUser(jwt);
  if(identity.error||!identity.data.user)
    return response({ok:false,code:"SIGN_IN_REQUIRED"},401,origin);
  const {data:member,error:memberError}=await db.from("corp_access_members")
    .select("role,active,clearance_level")
    .eq("user_id",identity.data.user.id).eq("active",true).maybeSingle();
  if(memberError||!member||member.role!=="owner"||Number(member.clearance_level)!==7)
    return response({ok:false,code:"OWNER_ONLY"},403,origin);
  const check=await db.rpc("corp_code_status");
  if(check.error||check.data?.ok!==true||check.data?.verified!==true)
    return response({ok:false,code:"SECURITY_SESSION_REQUIRED"},403,origin);
  let body: Record<string,unknown>;
  try{body=await req.json();if(!body||typeof body!=="object")throw Error("BAD_JSON")}
  catch{return response({ok:false,code:"BAD_JSON"},400,origin)}
  if(!["status","sync-one"].includes(String(body.action||"")))
    return response({ok:false,code:"UNSUPPORTED_ACTION"},400,origin);

  const secret=(Deno.env.get("BLACKCELL_BUNNY_STORAGE_ACCESS_KEY")||"").trim();
  if(!secret)return response({ok:false,code:"BUNNY_KEY_NOT_CONFIGURED"},503,origin);

  if(body.action==="status"){
    const {data,error}=await db.from("corp_social_assets")
      .select("id,owner_id,filename,bytes,source_provider,bunny_storage_path,review_status")
      .eq("purpose","library").eq("kind","photo").order("created_at",{ascending:true}).limit(5000);
    if(error)return response({ok:false,code:"LIBRARY_QUERY_FAILED"},503,origin);
    if((data||[]).length>=5000)return response({ok:false,code:"LIBRARY_QUERY_TOO_LARGE"},422,origin);
    const manual=(data||[]).filter(x=>x.source_provider!=="bunny-private"&&x.review_status==="approved");
    const missing=manual.filter(x=>!x.bunny_storage_path);
    const alreadyBunny=(data||[]).filter(x=>x.source_provider==="bunny-private");
    return response({ok:true,code:"LIBRARY_ARCHIVE_STATUS",
      approved_to_archive:manual.length,
      archived:manual.length-missing.length,
      remaining:missing.length,
      existing_bunny_files:alreadyBunny.length,
      remaining_bytes:missing.reduce((total,a)=>total+Number(a.bytes||0),0),
      items:missing.map(a=>({id:a.id,filename:a.filename,bytes:a.bytes}))
    },200,origin);
  }

  const assetId=typeof body.asset_id==="string"?body.asset_id:"";
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assetId))
    return response({ok:false,code:"INVALID_ASSET_ID"},422,origin);
  try{
    const {data:asset,error:assetError}=await db.from("corp_social_assets")
      .select("id,owner_id,purpose,kind,mime_type,storage_path,bytes,review_status,source_provider,bunny_storage_path")
      .eq("id",assetId).maybeSingle();
    if(assetError||!asset)return response({ok:false,code:"ASSET_NOT_FOUND"},404,origin);
    if(asset.purpose!=="library"||asset.kind!=="photo"||asset.review_status!=="approved"||
       asset.source_provider==="bunny-private")
      return response({ok:false,code:"ASSET_NOT_ELIGIBLE"},422,origin);
    if(asset.bunny_storage_path)
      return response({ok:true,verified:true,already:true,id:asset.id,code:"ALREADY_ARCHIVED"},200,origin);
    const mime=String(asset.mime_type||"");
    if(!mimeExt[mime]||Number(asset.bytes)<1||Number(asset.bytes)>maxFile)
      return response({ok:false,code:"UNSUPPORTED_MEDIA"},422,origin);
    if(!String(asset.storage_path).startsWith(String(asset.owner_id)+"/"))
      return response({ok:false,code:"INVALID_LIBRARY_PATH"},422,origin);

    // RLS and private Storage policies enforce the current corporate session.
    const downloaded=await db.storage.from(mediaBucket).download(asset.storage_path);
    if(downloaded.error||!downloaded.data)
      return response({ok:false,code:"SOURCE_DOWNLOAD_FAILED",
        detail:"Authorized source photo could not be retrieved; nothing was changed."},422,origin);
    const original=await downloaded.data.arrayBuffer();
    if(original.byteLength!==Number(asset.bytes)||original.byteLength>maxFile)
      return response({ok:false,code:"SOURCE_SIZE_MISMATCH"},422,origin);
    const contentHash=await digest(original);
    const key="blackcell-library/"+contentHash+"."+mimeExt[mime];
    let stored=await readBunny(key,secret);
    let duplicate=stored!==null;
    if(stored===null){
      await writeBunny(key,secret,original,mime);
      stored=await readBunny(key,secret);
    }
    if(!stored||stored.byteLength!==original.byteLength||await digest(stored)!==contentHash)
      return response({ok:false,code:"BUNNY_VERIFICATION_FAILED",
        detail:"Bunny did not return matching bytes; library metadata was not changed."},502,origin);

    // Only store a verified location: the Supabase gallery copy remains intact.
    const saved=await db.from("corp_social_assets")
      .update({bunny_storage_path:key,bunny_synced_at:new Date().toISOString()})
      .eq("id",asset.id).is("bunny_storage_path",null)
      .select("id,bunny_storage_path").maybeSingle();
    if(saved.error||!saved.data){
      const again=await db.from("corp_social_assets").select("bunny_storage_path")
        .eq("id",asset.id).maybeSingle();
      if(again.data?.bunny_storage_path===key)
        return response({ok:true,verified:true,already:true,id:asset.id,code:"ALREADY_ARCHIVED"},200,origin);
      return response({ok:false,code:"METADATA_SAVE_FAILED",
        detail:"Bunny copy was verified, but the library index could not be updated. Retry without deleting any original."},503,origin);
    }
    return response({ok:true,verified:true,id:asset.id,duplicate,bytes:original.byteLength,
      code:"BUNNY_ARCHIVE_VERIFIED"},200,origin);
  }catch(error){
    return response({ok:false,code:"SYNC_FAILED",detail:cleanError(error)},503,origin);
  }
});