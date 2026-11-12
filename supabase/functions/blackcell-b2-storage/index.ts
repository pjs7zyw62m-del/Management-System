import {createClient} from "npm:@supabase/supabase-js@2.119.0";
import {S3Client,ListObjectsV2Command} from "npm:@aws-sdk/client-s3@3.856.0";

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
/* Standard AWS Signature V4 signing via the supported AWS SDK, rather than
   constructing canonical requests by hand. No media or secret returned. */
async function checkBucket(keyId:string,secret:string,bucket:string,endpoint:string){
 const target=new URL(endpoint.trim());
 const match=/^s3\.([a-z0-9-]+)\.backblazeb2\.com$/i.exec(target.hostname);
 if(target.protocol!=="https:"||target.pathname!=="/"||target.search||target.hash||!match)
  return {ok:false,code:"INVALID_B2_ENDPOINT",detail:"Enter the S3 endpoint exactly as shown for your B2 bucket."};
 bucket=bucket.trim();
 if(!/^[a-z0-9][a-z0-9.-]{4,62}$/.test(bucket))
  return {ok:false,code:"INVALID_B2_BUCKET",detail:"Confirm your bucket name."};
 const region=match[1];
 const client=new S3Client({
  endpoint:target.origin,
  region,
  credentials:{accessKeyId:keyId.trim(),secretAccessKey:secret.trim()},
  forcePathStyle:true,
  maxAttempts:1,
  requestChecksumCalculation:"WHEN_REQUIRED",
  responseChecksumValidation:"WHEN_REQUIRED"
 });
 try{
  await client.send(new ListObjectsV2Command({Bucket:bucket,Prefix:"blackcell-intake/",MaxKeys:1}));
  return {ok:true,connected:true,region,bucket,prefix:"blackcell-intake/",method:"aws-sdk-v3"};
 }catch(e){
  const err=e as {name?:string,$metadata?:{httpStatusCode?:number}};
  const known=new Set(["InvalidAccessKeyId","SignatureDoesNotMatch","AccessDenied","InvalidArgument","InvalidBucketName","NoSuchBucket","AuthorizationHeaderMalformed","InvalidRequest","RequestTimeTooSkewed"]);
  const s3_code=known.has(String(err?.name||""))?String(err.name):"Other";
  const advice:Record<string,string>={
   InvalidAccessKeyId:"Backblaze does not recognize this Key ID. Confirm it comes from your blackcell-media-import application key.",
   SignatureDoesNotMatch:"Even with the standard AWS signer, Backblaze rejected the signature. Confirm the Key ID and the secret Application Key came from the SAME Backblaze key and were pasted without extra characters.",
   AccessDenied:"Backblaze denied access to list the blackcell-intake/ prefix. Check the selected bucket and key's Read and Write permissions.",
   InvalidArgument:"Backblaze rejected a request parameter. Confirm the bucket endpoint.",
   InvalidBucketName:"Backblaze rejected the bucket name.",
   NoSuchBucket:"The bucket is not found on the configured regional endpoint.",
   AuthorizationHeaderMalformed:"Backblaze rejected the region or authorization format.",
   InvalidRequest:"Backblaze rejected the S3 request.",
   RequestTimeTooSkewed:"Backblaze reports a clock difference during signing."
  };
  return {ok:false,code:"B2_ACCESS_ERROR",s3_code,http_status:Number(err?.$metadata?.httpStatusCode||0),
   detail:advice[s3_code]||"Could not verify the Backblaze S3 connection. Check the key pair, bucket, and endpoint."};
 }finally{
  client.destroy();
 }
}
/* Independent read-only native auth probe, only if S3 SDK verification fails.
   Backblaze B2 v4 supports ordinary restricted app keys, and HTTP 401 definitively
   indicates the supplied app Key ID / secret pairing is invalid.
   Do not persist, log or return the token or the submitted credentials. */
async function verifyNativeB2Pair(keyId:string,secret:string):Promise<{
 valid:boolean|"unknown",http_status:number,code:string,
 has_list_all_buckets?:boolean,has_list_files?:boolean
}>{
 let response:Response;
 try{
  const cred=btoa(String.fromCharCode(...new TextEncoder().encode(keyId.trim()+":"+secret.trim())));
  response=await fetch("https://api.backblazeb2.com/b2api/v4/b2_authorize_account",{
   method:"GET",headers:{Authorization:"Basic "+cred,Accept:"application/json"},
   signal:AbortSignal.timeout(12000)
  });
 }catch(_){return {valid:"unknown",http_status:0,code:"B2_NATIVE_UNREACHABLE"};}
 if(response.status===401)return {valid:false,http_status:401,code:"B2_NATIVE_INVALID_KEY_PAIR"};
 if(!response.ok)return {valid:"unknown",http_status:response.status,code:"B2_NATIVE_AUTH_ERROR"};
 try{
  const data=await response.json();
  const allowed=data?.apiInfo?.storageApi?.allowed||data?.allowed||{};
  const caps=Array.isArray(allowed.capabilities)?allowed.capabilities:[];
  // Some older Backblaze responses may omit allowed details. Capability presence is
  // advisory; false is not conclusive when the field itself is absent.
  return {
   valid:true,http_status:200,code:"B2_NATIVE_PAIR_VERIFIED",
   ...(Array.isArray(allowed.capabilities)?{
    has_list_all_buckets:caps.includes("listAllBucketNames"),
    has_list_files:caps.includes("listFiles")
   }:{})
  };
 }catch(_){return {valid:true,http_status:200,code:"B2_NATIVE_PAIR_VERIFIED"};}
}

Deno.serve(async request=>{
 const origin=request.headers.get("origin");
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
 if(request.method!=="POST")return json({ok:false,code:"METHOD_NOT_ALLOWED"},405,origin);
 // CORS is not authorization. Every request still requires a real user token.
 if(origin&&!origins.has(origin))return json({ok:false,code:"ORIGIN_NOT_ALLOWED"},403,origin);
 const bearer=request.headers.get("authorization")||"";
 if(!/^Bearer\s+\S+$/i.test(bearer))return json({ok:false,code:"UNAUTHORIZED",detail:"BLACKCELL login has expired. Sign in again."},401,origin);
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
  return json({ok:false,code:"OWNER_ONLY",detail:"A verified BLACKCELL Level 7 owner session is required."},403,origin);
 const verified=await db.rpc("corp_code_status");
 if(verified.error||verified.data?.ok!==true||verified.data?.verified!==true)
  return json({ok:false,code:"SECURITY_SESSION_REQUIRED",detail:"Your BLACKCELL security-code session expired. Sign in to Administration and verify your access/security codes, then retry."},403,origin);
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
  if(result.ok)return json(result,200,origin);
  const s3Error=("s3_code" in result)?result.s3_code:"";
  if(result.code!=="B2_ACCESS_ERROR"||s3Error!=="SignatureDoesNotMatch")
   return json(result,422,origin);
  const native=await verifyNativeB2Pair(keyId,secret);
  if(native.valid===false){
   return json({ok:false,connected:false,code:"B2_KEY_PAIR_INVALID",native_auth:"rejected",
    detail:"Backblaze rejected this same Key ID and secret through its independent Native API (HTTP 401). These two Supabase values are not a valid matching Backblaze application-key pair. Do not change the bucket or endpoint."},422,origin);
  }
  if(native.valid===true){
   return json({ok:false,connected:false,code:"B2_S3_SIGNATURE_FAILED",native_auth:"verified",
    s3_code:s3Error,
    permissions:{
     ...(typeof native.has_list_all_buckets==="boolean"?{listAllBucketNames:native.has_list_all_buckets}:{}),
     ...(typeof native.has_list_files==="boolean"?{listFiles:native.has_list_files}:{})
    },
    detail:"Backblaze Native API ACCEPTED your Key ID + secret pair, but its S3 API rejected the signature. The credentials match; we need to examine S3 compatibility, permissions and signing settings instead."},422,origin);
  }
  return json({ok:false,connected:false,code:"B2_NATIVE_CHECK_UNAVAILABLE",
   s3_code:s3Error,http_status:native.http_status,
   detail:"The S3 signature failed and independent Backblaze Native API verification was temporarily unavailable. Do not replace credentials until this can be checked."},422,origin);
 }catch(_){
  return json({ok:false,connected:false,code:"B2_CHECK_FAILED",
   detail:"Backblaze connection check failed. No files or credentials were exposed."},500,origin);
 }
});
