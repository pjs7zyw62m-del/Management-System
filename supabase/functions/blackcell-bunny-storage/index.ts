import { createClient } from "npm:@supabase/supabase-js@2.119.0";

/* BLACKCELL / Bunny Storage private read-only connection checker.
   API / HTTP Access Key Password is ONLY read from Supabase Edge Secrets.
   This function can never upload, list to a user, delete, or publish media.
   Only verified corporate Level 7 owner + current security codes can invoke.
*/
const zoneEndpoint="https://la.storage.bunnycdn.com/blackcell-media-vault/";
const origins=new Set([
  "https://blackcellcorp.com",
  "https://www.blackcellcorp.com",
  "https://pjs7zyw62m-del.github.io"
]);
function cors(origin:string|null):Record<string,string>{
  return {
    "Access-Control-Allow-Origin":origins.has(origin||"")?origin!:"https://blackcellcorp.com",
    "Access-Control-Allow-Headers":"authorization,apikey,x-client-info,content-type",
    "Access-Control-Allow-Methods":"POST,OPTIONS",
    "Cache-Control":"no-store",
    "Vary":"Origin"
  };
}
function send(data:Record<string,unknown>,status:number,origin:string|null){
  return new Response(JSON.stringify(data),{
    status,headers:{"Content-Type":"application/json",...cors(origin)}
  });
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
    return send({ok:false,code:"OWNER_ONLY",detail:"Verified BLACKCELL Level 7 owner access is required."},403,origin);
  const verified=await db.rpc("corp_code_status");
  if(verified.error||verified.data?.ok!==true||verified.data?.verified!==true)
    return send({ok:false,code:"SECURITY_SESSION_REQUIRED",detail:"Your corporate security-code session has expired; sign in and verify codes again."},403,origin);
  let action="";
  try{
    const body=await req.json();
    action=typeof body?.action==="string"?body.action:"";
  }catch(_){return send({ok:false,code:"INVALID_REQUEST"},400,origin)}
  if(action!=="status")return send({ok:false,code:"UNSUPPORTED_ACTION"},400,origin);

  const secret=Deno.env.get("BLACKCELL_BUNNY_STORAGE_ACCESS_KEY")||"";
  if(!secret.trim())return send({
    ok:true,connected:false,code:"BUNNY_KEY_NOT_CONFIGURED",
    endpoint:zoneEndpoint,
    detail:"Add BLACKCELL_BUNNY_STORAGE_ACCESS_KEY as a Supabase Edge Function Secret using Bunny Storage → Access → API / HTTP → Access Key Password (not the read-only password)."
  },200,origin);
  try{
    const r=await fetch(zoneEndpoint,{
      method:"GET",
      headers:{"AccessKey":secret.trim(),"Accept":"application/json"},
      redirect:"error",
      signal:AbortSignal.timeout(12000)
    });
    if(r.status===401)return send({ok:false,connected:false,code:"BUNNY_KEY_REJECTED",
      detail:"Bunny rejected the Storage Zone Access Key Password (HTTP 401). Check the value under Storage → blackcell-media-vault → Access → API / HTTP."},422,origin);
    if(r.status===403)return send({ok:false,connected:false,code:"BUNNY_ACCESS_DENIED",
      detail:"Bunny denied access to this storage zone (HTTP 403). Verify the correct storage-zone API / HTTP password."},422,origin);
    if(r.status===404)return send({ok:false,connected:false,code:"BUNNY_ZONE_NOT_FOUND",
      detail:"Bunny did not find the storage zone at the Los Angeles endpoint. Check its exact zone name and primary region."},422,origin);
    if(!r.ok)return send({ok:false,connected:false,code:"BUNNY_HTTP_ERROR",http_status:r.status,
      detail:"Bunny connection check failed. The storage zone and existing files were not changed."},422,origin);
    const list=await r.json().catch(()=>null);
    if(!Array.isArray(list))return send({ok:false,connected:false,code:"BUNNY_RESPONSE_INVALID",
      detail:"Bunny responded successfully but returned an unexpected folder listing format. No changes were made."},422,origin);
    // This deliberately does NOT return private file names or access credentials.
    return send({ok:true,connected:true,code:"BUNNY_CONNECTED",
      endpoint:zoneEndpoint,zone:"blackcell-media-vault",region:"Los Angeles",
      detail:"Private Bunny Storage read access verified. Bulk upload and file registration still require a separate secure uploader."},200,origin);
  }catch(_){
    return send({ok:false,connected:false,code:"BUNNY_CHECK_UNAVAILABLE",
      detail:"Unable to reach Bunny's Storage API. Existing files and credentials are unchanged."},503,origin);
  }
});
