import {createClient} from "npm:@supabase/supabase-js@2.119.0";
const origins=new Set(["https://blackcellcorp.com","https://www.blackcellcorp.com","https://pjs7zyw62m-del.github.io"]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin")||"";
 const headers={"Access-Control-Allow-Origin":origins.has(origin)?origin:"https://blackcellcorp.com","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Cache-Control":"no-store","Vary":"Origin","Content-Type":"application/json"};
 const send=(status:number,data:Record<string,unknown>)=>new Response(JSON.stringify(data),{status,headers});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST"||(origin&&!origins.has(origin)))return send(403,{ok:false,code:"REQUEST_DENIED"});
 const auth=req.headers.get("authorization")||"";
 if(!/^Bearer\s+\S+$/i.test(auth))return send(401,{ok:false,code:"SIGN_IN_REQUIRED"});
 const key=Deno.env.get("BLACKCELL_TURN_KEY_ID")?.trim(),token=Deno.env.get("BLACKCELL_TURN_API_TOKEN")?.trim();
 if(!key||!token)return send(503,{ok:false,code:"RELAY_NOT_CONFIGURED"});
 try{
  if(Number(req.headers.get('content-length')||0)>512)return send(400,{ok:false,code:'INVALID_REQUEST'});
  const body=await req.text();if(body.length>512)return send(400,{ok:false,code:"INVALID_REQUEST"});
  const room=JSON.parse(body)?.room;if(typeof room!=="string"||!uuid.test(room))return send(400,{ok:false,code:"INVALID_ROOM"});
  const jwt=auth.replace(/^Bearer\s+/i,""),db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:"Bearer "+jwt}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const user=await db.auth.getUser(jwt);if(user.error||!user.data.user)return send(401,{ok:false,code:"SIGN_IN_REQUIRED"});
  const permission=await db.rpc("corp_redline_group_live",{p_action:"turn",p_room:room});if(permission.error||permission.data?.ok!==true)return send(403,{ok:false,code:"RELAY_NOT_AUTHORIZED_OR_RATE_LIMITED"});
  const res=await fetch("https://rtc.live.cloudflare.com/v1/turn/keys/"+encodeURIComponent(key)+"/credentials/generate-ice-servers",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({ttl:14400}),redirect:"error",signal:AbortSignal.timeout(7000)});
  if(!res.ok)return send(502,{ok:false,code:"RELAY_PROVIDER_ERROR"});
  const data=await res.json();
  const iceServers=(Array.isArray(data.iceServers)?data.iceServers:[]).flatMap((s:{urls?:string|string[],username?:string,credential?:string})=>{
   const urls=(Array.isArray(s.urls)?s.urls:[s.urls]).filter((u):u is string=>typeof u==="string"&&/^(?:stun:stun\.cloudflare\.com:3478|turns?:turn\.cloudflare\.com:(?:3478|443|80|5349)\?transport=(?:udp|tcp))$/.test(u));
   if(!urls.length)return [];
   if(urls.some(u=>u.startsWith("turn"))){if(typeof s.username!=="string"||typeof s.credential!=="string")return [];return [{urls,username:s.username,credential:s.credential}]}
   return [{urls}];
  });
  if(!iceServers.some((s:{urls:string[]})=>s.urls.some(u=>u.startsWith("turn"))))return send(502,{ok:false,code:"RELAY_PROVIDER_ERROR"});
  return send(200,{ok:true,iceServers});
 }catch{return send(502,{ok:false,code:"RELAY_UNAVAILABLE"})}
});
