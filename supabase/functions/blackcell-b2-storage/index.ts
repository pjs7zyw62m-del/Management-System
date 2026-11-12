import {createClient} from "npm:@supabase/supabase-js@2.119.0";
import {S3Client,ListObjectsV2Command,PutObjectCommand,HeadObjectCommand,CreateMultipartUploadCommand,UploadPartCommand,CompleteMultipartUploadCommand,AbortMultipartUploadCommand} from "npm:@aws-sdk/client-s3@3.856.0";
import {getSignedUrl} from "npm:@aws-sdk/s3-request-presigner@3.856.0";

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


/* One-photo, owner-only test, staged in Backblaze and never published.
   SHA-256 content address prevents exact-byte duplicate test objects.
   Upload is server-side: no browser-to-B2 CORS changes or exposed B2 tokens. */
function detectPhoto(data:Uint8Array):{type:string,ext:string}|null{
 if(data.length<12)return null;
 if(data[0]===0xff&&data[1]===0xd8&&data[2]===0xff)return {type:"image/jpeg",ext:"jpg"};
 if([137,80,78,71,13,10,26,10].every((v,i)=>data[i]===v))return {type:"image/png",ext:"png"};
 const ascii=(start:number,length:number)=>String.fromCharCode(...data.subarray(start,start+length));
 if(ascii(0,4)==="RIFF"&&ascii(8,4)==="WEBP")return {type:"image/webp",ext:"webp"};
 if(ascii(0,6)==="GIF87a"||ascii(0,6)==="GIF89a")return {type:"image/gif",ext:"gif"};
 if(ascii(4,4)==="ftyp"){
  const brand=ascii(8,4);
  if(["heic","heix","hevc","hevx","mif1","msf1"].includes(brand))return {type:"image/heic",ext:"heic"};
  if(["avif","avis"].includes(brand))return {type:"image/avif",ext:"avif"};
 }
 return null;
}
async function importTestPhoto(photo:File,keyId:string,secret:string,bucket:string,endpoint:string){
 const maximum=8*1024*1024;
 if(photo.size<12||photo.size>maximum)return {ok:false,code:"PHOTO_SIZE_REJECTED",
  detail:"Choose one image smaller than 8 MB for this first connection test."};
 const target=new URL(endpoint.trim());
 const match=/^s3\.([a-z0-9-]+)\.backblazeb2\.com$/i.exec(target.hostname);
 if(target.protocol!=="https:"||target.pathname!=="/"||target.search||target.hash||!match)
  return {ok:false,code:"INVALID_B2_ENDPOINT",detail:"Verify the Backblaze S3 endpoint."};
 const bytes=new Uint8Array(await photo.arrayBuffer());
 const detected=detectPhoto(bytes);
 if(!detected)return {ok:false,code:"PHOTO_FORMAT_REJECTED",
  detail:"This first test supports JPEG, PNG, WEBP, GIF, HEIC and AVIF photos."};
 const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
 const hash=Array.from(digest).map(x=>x.toString(16).padStart(2,"0")).join("");
 const key="blackcell-intake/icloud-tests/sha256-"+hash+"."+detected.ext;
 const client=new S3Client({
  endpoint:target.origin,region:match[1],forcePathStyle:true,maxAttempts:1,
  credentials:{accessKeyId:keyId.trim(),secretAccessKey:secret.trim()},
  requestChecksumCalculation:"WHEN_REQUIRED",responseChecksumValidation:"WHEN_REQUIRED"
 });
 try{
  // An existing object with the same content digest is a confirmed duplicate.
  let existing=false;
  try{
   const head=await client.send(new HeadObjectCommand({Bucket:bucket.trim(),Key:key}));
   if(Number(head.ContentLength)!==bytes.length)throw new Error("CHECKSUM_COLLISION");
   existing=true;
  }catch(e){
   const err=e as {name?:string,message?:string,$metadata?:{httpStatusCode?:number}};
   if(err?.message==="CHECKSUM_COLLISION")throw e;
   if(err.name!=="NotFound"&&err.name!=="NoSuchKey"&&Number(err.$metadata?.httpStatusCode)!==404)throw e;
  }
  if(!existing){
   await client.send(new PutObjectCommand({
    Bucket:bucket.trim(),Key:key,Body:bytes,
    ContentLength:bytes.byteLength,ContentType:detected.type,
    Metadata:{"blackcell-import":"icloud-manual-test","sha256":hash}
   }));
  }
  const confirmed=await client.send(new HeadObjectCommand({Bucket:bucket.trim(),Key:key}));
  if(Number(confirmed.ContentLength)!==bytes.length)
   return {ok:false,code:"B2_VERIFY_SIZE_MISMATCH",detail:"Upload returned but Backblaze did not confirm the expected file length."};
  return {ok:true,connected:true,stored:true,duplicate:existing,bytes:bytes.length,
   mime_type:detected.type,storage_path:key,
   detail:existing?"Identical photo already exists in private Backblaze staging; no second copy was saved.":
   "Photo uploaded and verified in private Backblaze staging. It is not published to the website."};
 }catch(e){
  const err=e as {name?:string,$metadata?:{httpStatusCode?:number}};
  const allowed=new Set(["AccessDenied","InvalidAccessKeyId","SignatureDoesNotMatch","RequestTimeout","EntityTooLarge","InvalidRequest"]);
  const reason=allowed.has(String(err?.name))?err.name:"Other";
  return {ok:false,code:"B2_TEST_UPLOAD_FAILED",b2_code:reason,
   detail:"Backblaze did not verify the photo upload ("+reason+"). Existing media remains unchanged."};
 }finally{client.destroy();}
}


/* Owner-only massive-upload presigner.
   The browser transfers each photo/video directly to Backblaze B2, avoiding
   Supabase's media proxy and large-body limits. This function never exposes
   a long-lived B2 credential and never publishes assets. */
const BULK_PART_BYTES=32*1024*1024;
const BULK_MAX_BYTES=50*1024*1024*1024; // 50 GiB per individual file; no batch cap
const BULK_SMALL_BYTES=32*1024*1024;
const BULK_SESSION_MS=7*24*60*60*1000;
const BULK_TYPES=new Map([
 ["jpg","image/jpeg"],["jpeg","image/jpeg"],["png","image/png"],
 ["gif","image/gif"],["webp","image/webp"],["heic","image/heic"],
 ["heif","image/heif"],["avif","image/avif"],["tif","image/tiff"],
 ["tiff","image/tiff"],["bmp","image/bmp"],["mp4","video/mp4"],
 ["mov","video/quicktime"],["m4v","video/x-m4v"],["webm","video/webm"],
 ["avi","video/x-msvideo"],["mkv","video/x-matroska"],["3gp","video/3gpp"]
]);
const enc=new TextEncoder();
function toB64url(bytes:Uint8Array):string{
 let s="";for(const b of bytes)s+=String.fromCharCode(b);
 return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function fromB64url(value:string):Uint8Array{
 const decoded=atob(value.replace(/-/g,"+").replace(/_/g,"/"));
 return Uint8Array.from(decoded,c=>c.charCodeAt(0));
}
async function bulkSecret(secret:string){
 return crypto.subtle.importKey("raw",enc.encode(secret),
  {name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
}
type BulkTicket={
 v:number,owner:string,key:string,bytes:number,mime:string,
 fingerprint:string,uploadId:string|null,parts:number,expires:number
};
async function signBulkTicket(data:BulkTicket,secret:string){
 const payload=enc.encode(JSON.stringify(data));
 const signature=await crypto.subtle.sign("HMAC",await bulkSecret(secret),payload);
 return toB64url(payload)+"."+toB64url(new Uint8Array(signature));
}
async function readBulkTicket(ticket:unknown,owner:string,secret:string):Promise<BulkTicket|null>{
 if(typeof ticket!=="string"||ticket.length>2200||!ticket.includes("."))return null;
 const split=ticket.split(".");
 if(split.length!==2)return null;
 try{
  const payload=fromB64url(split[0]),sig=fromB64url(split[1]);
  const verified=await crypto.subtle.verify("HMAC",await bulkSecret(secret),sig,payload);
  if(!verified)return null;
  const data=JSON.parse(new TextDecoder().decode(payload)) as BulkTicket;
  if(data.v!==1||data.owner!==owner||data.expires<Date.now()||
     data.expires>Date.now()+BULK_SESSION_MS+60000||
     !/^blackcell-intake\/bulk\/[a-f0-9]{2}\/[a-f0-9]{64}$/.test(data.key)||
     !Number.isSafeInteger(data.bytes)||data.bytes<1||data.bytes>BULK_MAX_BYTES||
     !/^[a-f0-9]{64}$/.test(data.fingerprint)||!Number.isInteger(data.parts)||
     data.parts<1||data.parts>10000||
     (data.uploadId!==null&&(typeof data.uploadId!=="string"||data.uploadId.length>300)))return null;
  return data;
 }catch(_){return null;}
}
function bulkClient(keyId:string,secret:string,endpoint:string){
 const url=new URL(endpoint.trim());
 const match=/^s3\.([a-z0-9-]+)\.backblazeb2\.com$/i.exec(url.hostname);
 if(url.protocol!=="https:"||url.pathname!=="/"||url.search||url.hash||!match)throw Error("INVALID_ENDPOINT");
 return new S3Client({endpoint:url.origin,region:match[1],forcePathStyle:true,maxAttempts:2,
  credentials:{accessKeyId:keyId.trim(),secretAccessKey:secret.trim()},
  requestChecksumCalculation:"WHEN_REQUIRED",responseChecksumValidation:"WHEN_REQUIRED"});
}
function bulkBad(detail:string,code="BULK_VALIDATION"){return {ok:false,code,detail};}
async function doBulkAction(
 action:string,payload:Record<string,unknown>,owner:string,
 keyId:string,secret:string,bucket:string,endpoint:string
):Promise<Record<string,unknown>>{
 const client=bulkClient(keyId,secret,endpoint);
 const name=typeof payload.name==="string"?payload.name:"";
 const bytes=Number(payload.bytes);
 const fingerprint=typeof payload.fingerprint==="string"?payload.fingerprint:"";
 const bucketName=bucket.trim();
 try{
  if(action==="bulk-plan"){
   if(name.length<1||name.length>250||
      !Number.isSafeInteger(bytes)||bytes<1||bytes>BULK_MAX_BYTES||
      !/^[a-f0-9]{64}$/.test(fingerprint))
    return bulkBad("Invalid name, content fingerprint or file size (individual-file limit: 50 GiB).");
   const ext=name.split(".").pop()?.toLowerCase()||"";
   const mime=BULK_TYPES.get(ext);
   if(!mime)return bulkBad("Supported files: photos (including HEIC) and common video formats.");
   const key="blackcell-intake/bulk/"+fingerprint.slice(0,2)+"/"+fingerprint;
   try{
    const head=await client.send(new HeadObjectCommand({Bucket:bucketName,Key:key}));
    if(Number(head.ContentLength)===bytes)
     return {ok:true,duplicate:true,stored:true,bytes,detail:"Exact content fingerprint already exists in private Backblaze staging. Skipped."};
    return bulkBad("A previously stored file has the same fingerprint but a different length. No file was overwritten.","BULK_FINGERPRINT_CONFLICT");
   }catch(e){
    const err=e as {$metadata?:{httpStatusCode?:number},name?:string};
    if(err.$metadata?.httpStatusCode!==404&&err.name!=="NotFound"&&err.name!=="NoSuchKey")throw e;
   }
   let uploadId:string|null=null;
   const parts=Math.ceil(bytes/BULK_PART_BYTES);
   if(bytes>BULK_SMALL_BYTES){
    const result=await client.send(new CreateMultipartUploadCommand({
     Bucket:bucketName,Key:key,ContentType:mime,
     Metadata:{"blackcell-intake":"bulk","fingerprint":fingerprint}
    }));
    if(!result.UploadId)throw Error("UPLOAD_ID_MISSING");
    uploadId=result.UploadId;
   }
   const session:BulkTicket={v:1,owner,key,bytes,mime,fingerprint,uploadId,parts,
    expires:Date.now()+BULK_SESSION_MS};
   const ticket=await signBulkTicket(session,secret);
   if(uploadId)return {ok:true,mode:"multipart",ticket,parts,part_size:BULK_PART_BYTES,
    detail:"Private multipart upload created; media is not published."};
   const signed=await getSignedUrl(client,new PutObjectCommand({
    Bucket:bucketName,Key:key,ContentType:mime
   }),{expiresIn:900});
   return {ok:true,mode:"single",ticket,url:signed,mime,parts:1,
    detail:"Temporary upload URL created for private staging."};
  }
  const session=await readBulkTicket(payload.ticket,owner,secret);
  if(!session)return bulkBad("Upload authorization expired or invalid. Select the file and restart this upload.","BULK_SESSION_INVALID");
  if(action==="bulk-part"){
   if(!session.uploadId)return bulkBad("This upload doesn't use multipart.");
   const part=Number(payload.part);
   if(!Number.isInteger(part)||part<1||part>session.parts)return bulkBad("Invalid file part.");
   const signed=await getSignedUrl(client,new UploadPartCommand({
    Bucket:bucketName,Key:session.key,UploadId:session.uploadId,PartNumber:part
   }),{expiresIn:900});
   return {ok:true,url:signed,part,expires_in_seconds:900};
  }
  if(action==="bulk-complete"){
   if(!session.uploadId)return bulkBad("This upload doesn't use multipart.");
   const supplied=Array.isArray(payload.parts)?payload.parts:[];
   if(supplied.length!==session.parts)return bulkBad("Not all parts have finished uploading.");
   const clean:{PartNumber:number,ETag:string}[]=[];
   for(let i=0;i<supplied.length;i++){
    const part=supplied[i] as {part?:unknown,etag?:unknown};
    if(Number(part.part)!==i+1||typeof part.etag!=="string"||
       !/^"?[a-zA-Z0-9-]{8,128}"?$/.test(part.etag))return bulkBad("Part receipts are missing or invalid.");
    clean.push({PartNumber:i+1,ETag:part.etag});
   }
   await client.send(new CompleteMultipartUploadCommand({
    Bucket:bucketName,Key:session.key,UploadId:session.uploadId,
    MultipartUpload:{Parts:clean}
   }));
  }else if(action==="bulk-abort"){
   if(!session.uploadId)return {ok:true,aborted:true};
   await client.send(new AbortMultipartUploadCommand({
    Bucket:bucketName,Key:session.key,UploadId:session.uploadId
   }));
   return {ok:true,aborted:true};
  }else if(action!=="bulk-verify")return bulkBad("Unsupported bulk operation.","BULK_ACTION");
  const head=await client.send(new HeadObjectCommand({Bucket:bucketName,Key:session.key}));
  if(Number(head.ContentLength)!==session.bytes)return bulkBad("Backblaze did not verify the expected file size.","BULK_VERIFY_SIZE");
  return {ok:true,stored:true,bytes:session.bytes,mime_type:session.mime,
   verified:true,detail:"Verified in private Backblaze storage; not published."};
 }catch(e){
  const err=e as {name?:string,$metadata?:{httpStatusCode?:number}};
  const allowed=new Set(["AccessDenied","SignatureDoesNotMatch","InvalidAccessKeyId",
   "NoSuchUpload","InvalidPart","InvalidPartOrder","EntityTooLarge","RequestTimeout","NotFound"]);
  const reason=allowed.has(String(err.name))?String(err.name):"Other";
  return {ok:false,code:"BULK_B2_ERROR",b2_code:reason,
   detail:"Backblaze bulk-upload operation failed ("+reason+"). Check the upload connection; existing media was not deleted."};
 }finally{client.destroy();}
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
 let action="",photo:File|null=null,payload:Record<string,unknown>={};
 try{
  if((request.headers.get("content-type")||"").toLowerCase().includes("multipart/form-data")){
   const length=Number(request.headers.get("content-length")||0);
   if(length>9*1024*1024)return json({ok:false,code:"TEST_TOO_LARGE",detail:"Choose a photo smaller than 8 MB."},413,origin);
   const form=await request.formData();
   action=String(form.get("action")||"");
   const file=form.get("photo");
   if(file instanceof File)photo=file;
  }else{
   payload=await request.json();
   action=typeof payload?.action==="string"?payload.action:"";
  }
 }catch(_){return json({ok:false,code:"INVALID_UPLOAD_REQUEST",detail:"Could not read the selected file."},400,origin)}
 if(action!=="status"&&action!=="import-photo-test"&&
    !["bulk-plan","bulk-part","bulk-complete","bulk-verify","bulk-abort"].includes(action))
  return json({ok:false,code:"UNSUPPORTED_ACTION"},400,origin);
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
 if(action.startsWith("bulk-")){
  const result=await doBulkAction(action,payload,identity.data.user.id,keyId,secret,bucket,endpoint);
  return json(result,result.ok?200:422,origin);
 }
 if(action==="import-photo-test"){
  if(!photo)return json({ok:false,code:"PHOTO_REQUIRED",detail:"Select one photo from Photos or iCloud Drive."},400,origin);
  try{
   const result=await importTestPhoto(photo,keyId,secret,bucket,endpoint);
   return json(result,result.ok?200:422,origin);
  }catch(_){
   return json({ok:false,code:"B2_TEST_IMPORT_FAILED",detail:"The selected photo could not be imported. No existing media was modified."},500,origin);
  }
 }
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
