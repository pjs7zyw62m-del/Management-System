import {createClient} from "npm:@supabase/supabase-js@2.119.0";
const origins=new Set(["https://blackcellcorp.com","https://www.blackcellcorp.com","https://pjs7zyw62m-del.github.io"]);
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 const headers={"Access-Control-Allow-Origin":origins.has(origin)?origin:"https://blackcellcorp.com","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Cache-Control":"private, no-store","Vary":"Origin","X-Content-Type-Options":"nosniff","Content-Type":"application/json"};
 const send=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST"||(origin&&!origins.has(origin)))return send(403,{ok:false,code:"REQUEST_DENIED"});
 const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!jwt)return send(401,{ok:false,code:"SIGN_IN_REQUIRED"});
 const host=Deno.env.get("SUPABASE_URL")||"",pub=Deno.env.get("SUPABASE_ANON_KEY")||"";
 if(!host||!pub)return send(503,{ok:false,code:"SERVICE_UNAVAILABLE"});
 try{
  const db=createClient(host,pub,{global:{headers:{Authorization:"Bearer "+jwt}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const identity=await db.auth.getUser(jwt),uid=identity.data.user?.id;
  if(identity.error||!uid)return send(401,{ok:false,code:"SIGN_IN_REQUIRED"});
  const member=await db.from("corp_access_members").select("role,clearance_level").eq("user_id",uid).eq("active",true).maybeSingle();
  if(member.error||member.data?.role!=="owner"||Number(member.data?.clearance_level)!==7)return send(403,{ok:false,code:"OWNER_REQUIRED"});
  const verify=await db.rpc("corp_code_status");
  if(verify.error||verify.data?.verified!==true)return send(403,{ok:false,code:"VERIFY_CORPORATE_SESSION"});
  const key=Deno.env.get("BLACKCELL_KLING_API_KEY")?.trim();
  if(!key)return send(200,{ok:false,code:"SECRET_MISSING"});
  const end=Date.now(),u=new URL("https://api-singapore.klingai.com/account/costs");
  u.searchParams.set("start_time",String(end-30*86400000));u.searchParams.set("end_time",String(end));
  const upstream=await fetch(u,{headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},redirect:"error",signal:AbortSignal.timeout(12000)});
  const data=await upstream.json().catch(()=>null);
  if(!upstream.ok||data?.code!==0||data?.data?.code!==0)return send(200,{ok:false,code:upstream.status===401?"KEY_REJECTED":"PROVIDER_CHECK_FAILED",providerStatus:upstream.status});
  const packs=Array.isArray(data.data.resource_pack_subscribe_infos)?data.data.resource_pack_subscribe_infos:[];
  return send(200,{ok:true,code:"CONNECTED",activePackages:packs.filter((p:Record<string,unknown>)=>p.status==="online").length});
 }catch{return send(200,{ok:false,code:"CONNECTION_CHECK_FAILED"})}
});