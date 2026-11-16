import {createClient} from "npm:@supabase/supabase-js@2.119.0";
Deno.serve(async req=>{
 const reply=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
 if(req.method!=="GET")return reply(405,{error:"METHOD"});
 const token=req.headers.get("x-blackcell-render-key")||"";
 if(!/^[a-f0-9]{64}$/.test(token))return reply(401,{error:"UNAUTHORIZED"});
 const offset=Number(new URL(req.url).searchParams.get("offset")||0);
 if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return reply(400,{error:"OFFSET"});
 try{
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,"0")).join("");
  const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await supabase.rpc("blackcell_render_catalog",{p_digest:digest,p_offset:offset});
  if(error)return reply(503,{error:"CATALOG_UNAVAILABLE"});
  if(!Array.isArray(data))return reply(401,{error:"UNAUTHORIZED"});
  return reply(200,data);
 }catch{return reply(503,{error:"CATALOG_UNAVAILABLE"})}
});