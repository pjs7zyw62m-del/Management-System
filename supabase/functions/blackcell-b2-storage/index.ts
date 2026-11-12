import {createClient} from "npm:@supabase/supabase-js@2.119.0";

/* BLACKCELL's private Backblaze B2 connection check.
   Never exposes credentials or media. Only the authenticated Level 7
   corporate owner with live security code verification can invoke it.
   Uses S3 Signature V4 against a tightly scoped intake-only prefix.
*/
const origins=new Set([
 "https://blackcellcorp.com",
 "https://www.blackcellcorp.com",
 "https://pjs7zyw62m-del.github.io"
]);
const encoder=new TextEncoder();
function cors(origin:string|null):Record<string,string>{
 return {
  "Access-Control-Allow-Origin":origins.has(origin||"")?origin!:"https://blackcellcorp.com",
  "Access-Control-Allow-Headers":"authorization,apikey,x-client-info,content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Cache-Control":"no-store",
  "Vary":"Origin"
 };
}
function json(data:Record<string,unknown>,status:number,origin:string|null){
 return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json",...cors(origin)}});
}
const byteHex=(u:Uint8Array)=>Array.from(u,x=>x.toString(16).padStart(2,"0")).join("");
async function sha256(input:string){
 return byteHex(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(input))));
}
async function hmac(key:string|Uint8Array,message:string):Promise<Uint8Array>{
 const bytes=typeof key==="string"?encoder.encode(key):key;
 const cryptokey=await crypto.subtle.importKey("raw",bytes,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return new Uint8Array(await crypto.subtle.sign("HMAC",cryptokey,encoder.encode(message)));
}
async function checkBucket(keyId:string,secret:string,bucket:string,endpoint:string){
 const target=new URL(endpoint);
 const match=/^s3\.([a-z0-9-]+)\.backblazeb2\.com$/i.exec(target.hostname);
 if(target.protocol!=="https:"||target.pathname!=="/"||target.search||target.hash||!match)
  return {ok:false,code:"INVALID_B2_ENDPOINT",detail:"Enter the S3 endpoint exactly as shown for your B2 bucket."};
 if(!/^[a-z0-9][a-z0-9.-]{4,62}$/.test(bucket))
  return {ok:false,code:"INVALID_B2_BUCKET",detail:"Confirm your bucket name."};
 const region=match[1],now=new Date();
 const amzDate=now.toISOString().replace(/[:-]|\.\d{3}/g,"");
 const day=amzDate.slice(0,8);
 const payloadHash=await sha256("");
 const path="/"+bucket;
 // Prefix must be at least as restrictive as the application's Backblaze key.
 const query="list-type=2&max-keys=1&prefix=blackcell-intake%2F";
 const canonicalHeaders="host:"+target.host+"\n"+
  "x-amz-content-sha256:"+payloadHash+"\n"+
  "x-amz-date:"+amzDate+"\n";
 const signedHeaders="host;x-amz-content-sha256;x-amz-date";
 const canonical=["GET",path,query,canonicalHeaders,signedHeaders,payloadHash].join("\n");
 const scope=day+"/"+region+"/s3/aws4_request";
 const toSign=["AWS4-HMAC-SHA256",amzDate,scope,await sha256(canonical)].join("\n");
 const kDay=await hmac("AWS4"+secret,day);
 const kRegion=await hmac(kDay,region);
 const kService=await hmac(kRegion,"s3");
 const kSigning=await hmac(kService,"aws4_request");
 const signature=byteHex(await hmac(kSigning,toSign));
 const authorization="AWS4-HMAC-SHA256 Credential="+keyId+"/"+scope+
  ",SignedHeaders="+signedHeaders+",Signature="+signature;
 const url=target.origin+path+"?"+query;
 let response:Response;
 try{
  response=await fetch(url,{method:"GET",headers:{
   "Authorization":authorization,
   "x-amz-content-sha256":payloadHash,
   "x-amz-date":amzDate
  },signal:AbortSignal.timeout(12000)});
 }catch(_){
  return {ok:false,code:"B2_UNREACHABLE",detail:"Could not reach Backblaze. Try again shortly."};
 }
 if(!response.ok){
  return {
   ok:false,code:"B2_ACCESS_ERROR",
   http_status:response.status,
   detail:response.status===401||response.status===403
    ?"The bucket rejected these credentials or the blackcell-intake/ permission. Check Key ID, secret, bucket and endpoint."
    :"Backblaze returned an unsuccessful response. Check the private bucket configuration."
  };
 }
 const xml=await response.text();
 if(!xml.includes("ListBucketResult"))
  return {ok:false,code:"B2_UNEXPECTED_RESPONSE",detail:"Backblaze returned an unexpected response."};
 return {ok:true,connected:true,region,bucket,prefix:"blackcell-intake/"};
}
Deno.serve(async request=>{
 const origin=request.headers.get("origin");
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
 if(request.method!=="POST")return json({ok:false,code:"METHOD_NOT_ALLOWED"},405,origin);
 // CORS is not authorization. Every request still requires a real user token.
 if(origin&&!origins.has(origin))return json({ok:false,code:"ORIGIN_NOT_ALLOWED"},403,origin);
 const bearer=request.headers.get("authorization")||"";
 if(!/^Bearer\s+\S+$/i.test(bearer))return json({ok:false,code:"UNAUTHORIZED"},401,origin);
 const token=bearer.replace(/^Bearer\s+/i,"").trim();
 const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
 const defaultPub=Deno.env.get("SUPABASE_ANON_KEY")||
  (()=>{try{return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||""}catch{return ""}})();
 if(!supabaseUrl||!defaultPub)return json({ok:false,code:"SERVER_AUTH_UNAVAILABLE"},503,origin);
 const db=createClient(supabaseUrl,defaultPub,{
  global:{headers:{Authorization:"Bearer "+token}},
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
 });
 const identity=await db.auth.getUser(token);
 if(identity.error||!identity.data.user)return json({ok:false,code:"UNAUTHORIZED"},401,origin);
 const {data:member,error:memberError}=await db.from("corp_access_members")
  .select("user_id,role,active,clearance_level")
  .eq("user_id",identity.data.user.id).eq("active",true).maybeSingle();
 if(memberError||!member||member.role!=="owner"||Number(member.clearance_level)!==7)
  return json({ok:false,code:"OWNER_ONLY"},403,origin);
 const verified=await db.rpc("corp_code_status");
 if(verified.error||verified.data?.ok!==true||verified.data?.verified!==true)
  return json({ok:false,code:"SECURITY_SESSION_REQUIRED"},403,origin);
 let action="";
 try{
  const payload=await request.json();
  action=typeof payload?.action==="string"?payload.action:"";
 }catch(_){return json({ok:false,code:"INVALID_JSON"},400,origin)}
 if(action!=="status")return json({ok:false,code:"UNSUPPORTED_ACTION"},400,origin);
 const keyId=Deno.env.get("BLACKCELL_B2_KEY_ID")||"";
 const secret=Deno.env.get("BLACKCELL_B2_APPLICATION_KEY")||"";
 const bucket=Deno.env.get("BLACKCELL_B2_BUCKET")||"";
 const endpoint=Deno.env.get("BLACKCELL_B2_ENDPOINT")||"";
 const missing=[
  ["BLACKCELL_B2_KEY_ID",keyId],
  ["BLACKCELL_B2_APPLICATION_KEY",secret],
  ["BLACKCELL_B2_BUCKET",bucket],
  ["BLACKCELL_B2_ENDPOINT",endpoint]
 ].filter(([,value])=>!String(value).trim()).map(([name])=>name);
 if(missing.length)
  return json({ok:true,connected:false,code:"B2_NOT_CONFIGURED",
   detail:"Missing in NEXUS Management System → Edge Function Secrets: "+missing.join(", ")+". Add these exact secret names and their values, then press CHECK CONNECTION."},200,origin);
 try{
  const result=await checkBucket(keyId,secret,bucket,endpoint);
  return json(result,result.ok?200:422,origin);
 }catch(_){
  return json({ok:false,connected:false,code:"B2_CHECK_FAILED",
   detail:"Backblaze connection check failed. No files or credentials were exposed."},500,origin);
 }
});
