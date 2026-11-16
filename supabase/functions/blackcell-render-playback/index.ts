import {createClient} from "npm:@supabase/supabase-js@2.119.0";
const zone="https://la.storage.bunnycdn.com/blackcell-media-vault/blackcell-renders/v1/";
const origins=new Set(["https://blackcellcorp.com","https://www.blackcellcorp.com","https://pjs7zyw62m-del.github.io"]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const generation=/^[0-9a-f]{32}$/;
const filePattern=/^(?:master\.m3u8|[0-9]{1,4}\/(?:index\.m3u8|seg-[0-9]{5,8}\.ts))$/;
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 const h={"Access-Control-Allow-Origin":origins.has(origin)?origin:"https://blackcellcorp.com","Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","Vary":"Origin"};
 const fail=(status:number,code:string)=>new Response(JSON.stringify({ok:false,code}),{status,headers:{...h,"Content-Type":"application/json"}});
 if(origin&&!origins.has(origin))return fail(403,"REQUEST_DENIED");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
 if(req.method!=="GET")return fail(405,"REQUEST_DENIED");
 const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!jwt)return fail(401,"SIGN_IN_REQUIRED");
 const host=Deno.env.get("SUPABASE_URL")||"",pub=Deno.env.get("SUPABASE_ANON_KEY")||"",key=Deno.env.get("BLACKCELL_BUNNY_STORAGE_ACCESS_KEY")?.trim()||"";
 if(!host||!pub||!key)return fail(503,"RENDER_DELIVERY_NOT_CONFIGURED");
 const u=new URL(req.url),id=u.searchParams.get("id")||"",file=u.searchParams.get("file")||"master.m3u8",g=u.searchParams.get("generation")||"";
 if(!uuid.test(id)||!filePattern.test(file)||(g&&!generation.test(g)))return fail(400,"INVALID_REQUEST");
 try{
  const db=createClient(host,pub,{global:{headers:{Authorization:"Bearer "+jwt}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const identity=await db.auth.getUser(jwt),uid=identity.data.user?.id;
  if(identity.error||!uid)return fail(401,"SIGN_IN_REQUIRED");
  const member=await db.from("corp_access_members").select("role,clearance_level").eq("user_id",uid).eq("active",true).maybeSingle(),role=member.data?.role;
  if(member.error||!["owner","employee"].includes(role)||role==="owner"&&Number(member.data?.clearance_level)!==7)return fail(403,"MEMBER_REQUIRED");
  const verify=await db.rpc(role==="owner"?"corp_code_status":"corp_employee_code_status");
  if(verify.error||verify.data?.verified!==true)return fail(403,"VERIFY_CORPORATE_SESSION");
  const row=await db.from("corp_social_assets").select("id,owner_id,kind,purpose,source_provider,review_status,adult_restricted,rights_confirmed").eq("id",id).maybeSingle(),a=row.data;
  if(row.error||!a||!uuid.test(a.owner_id)||a.kind!=="video"||a.purpose!=="library"||a.source_provider!=="world-bunny-v1"||a.review_status!=="approved"||a.adult_restricted!==false||a.rights_confirmed!==true)return fail(404,"MEDIA_UNAVAILABLE");
  const root=zone+a.owner_id+"/"+id+"/",get=(path:string)=>fetch(root+path,{headers:{AccessKey:key},redirect:"error",signal:AbortSignal.timeout(30000)});
  let current=g;
  if(!current||file.endsWith(".m3u8")){
   const marker=await get("ready.json");if(!marker.ok)return fail(marker.status===404?404:502,"RENDER_NOT_READY");
   const raw=await marker.text();if(raw.length>65536)return fail(502,"INVALID_RENDER");
   const value=JSON.parse(raw);if(value.version!==1||value.asset_id!==id||!generation.test(value.generation)||current&&current!==value.generation)return fail(404,"RENDER_NOT_READY");current=value.generation;
  }
  // Segments can only be fetched with a validated path under the same authorized asset.
  // A generation is random and only published to an authorized manifest reader.
  const upstream=await get(current+"/"+file);
  if(!upstream.ok||!upstream.body)return fail(upstream.status===404?404:502,"RENDER_UNAVAILABLE");
  if(file.endsWith(".ts"))return new Response(upstream.body,{headers:{...h,"Content-Type":"video/mp2t"}});
  const playlist=await upstream.text();if(playlist.length>1024*1024||!playlist.startsWith("#EXTM3U"))return fail(502,"INVALID_RENDER");
  const base=file.includes("/")?file.split("/")[0]+"/":"";
  const rewritten=playlist.split(/\r?\n/).map(line=>{
   if(!line.trim()||line.startsWith("#")){if(/URI\s*=/i.test(line))throw Error("Unsupported playlist tag");return line}
   const path=base+line.trim();if(!filePattern.test(path))throw Error("Invalid playlist path");
   const q=new URLSearchParams({id,file:path,generation:current});return u.pathname+"?"+q.toString();
  }).join("\n");
  return new Response(rewritten,{headers:{...h,"Content-Type":"application/vnd.apple.mpegurl"}});
 }catch{return fail(502,"RENDER_DELIVERY_FAILED")}
});
