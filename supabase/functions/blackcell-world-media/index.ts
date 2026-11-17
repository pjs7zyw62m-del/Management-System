import {createClient} from "npm:@supabase/supabase-js@2.119.0";
const zone="https://la.storage.bunnycdn.com/blackcell-media-vault/blackcell-worlds/v1/";
const origins=new Set(["https://blackcellcorp.com","https://www.blackcellcorp.com","https://pjs7zyw62m-del.github.io"]);
const types:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif","image/heic":"heic","video/mp4":"mp4","video/webm":"webm","video/quicktime":"mov","video/x-m4v":"m4v"};
const categories=new Set(["military","police","fire","medical","security","professional","unsorted"]);
const max=45*1024*1024,provider="world-bunny-v1",uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const digest=async(a:BufferSource)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",a)),x=>x.toString(16).padStart(2,"0")).join("");
async function bounded(req:Request,limit:number){
 if(!req.body)throw Error("EMPTY_BODY");
 const reader=req.body.getReader(),parts:Uint8Array[]=[];let n=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>limit){await reader.cancel();throw Error("FILE_TOO_LARGE")}parts.push(value)}}finally{reader.releaseLock()}
 if(n===0)throw Error("EMPTY_BODY");const bytes=new Uint8Array(n);let off=0;for(const p of parts){bytes.set(p,off);off+=p.length}return bytes;
}
function pathFor(uid:string,id:string,mime:string){if(!uuid.test(uid)||!uuid.test(id)||!Object.hasOwn(types,mime))throw Error("INVALID_PATH");return uid+"/"+id+"."+types[mime]}
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 const headers={"Access-Control-Allow-Origin":origins.has(origin)?origin:"https://blackcellcorp.com","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info,x-bc-name,x-bc-category,x-bc-branch,x-bc-orientation,x-bc-rights","Cache-Control":"private, no-store","Vary":"Origin","X-Content-Type-Options":"nosniff"};
 const send=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:{...headers,"Content-Type":"application/json"}});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST"||(origin&&!origins.has(origin)))return send(403,{ok:false,code:"REQUEST_DENIED"});
 const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!jwt)return send(401,{ok:false,code:"SIGN_IN_REQUIRED"});
 const host=Deno.env.get("SUPABASE_URL")||"",pub=Deno.env.get("SUPABASE_ANON_KEY")||"",key=Deno.env.get("BLACKCELL_BUNNY_STORAGE_ACCESS_KEY")?.trim()||"";
 if(!host||!pub||!key)return send(503,{ok:false,code:"WORLD_STORAGE_NOT_CONFIGURED"});
 const db=createClient(host,pub,{global:{headers:{Authorization:"Bearer "+jwt}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 try{
  const identity=await db.auth.getUser(jwt),uid=identity.data.user?.id;
  if(identity.error||!uid)return send(401,{ok:false,code:"SIGN_IN_REQUIRED"});
  const member=await db.from("corp_access_members").select("role,clearance_level").eq("user_id",uid).eq("active",true).maybeSingle(),role=member.data?.role;
  if(member.error||!["owner","employee"].includes(role)||role==="owner"&&Number(member.data?.clearance_level)!==7)return send(403,{ok:false,code:"MEMBER_REQUIRED"});
  const verify=await db.rpc(role==="owner"?"corp_code_status":"corp_employee_code_status");
  if(verify.error||verify.data?.verified!==true)return send(403,{ok:false,code:"VERIFY_CORPORATE_SESSION"});
  const action=new URL(req.url).searchParams.get("action");
  if(action==="read"){
   let payload;try{payload=JSON.parse(new TextDecoder().decode(await bounded(req,4096)))}catch{return send(400,{ok:false,code:"INVALID_REQUEST"})}
   if(typeof payload.id!=="string"||!uuid.test(payload.id))return send(400,{ok:false,code:"INVALID_ID"});
   const row=await db.from("corp_social_assets").select("id,owner_id,storage_path,mime_type,source_provider,purpose,review_status,adult_restricted").eq("id",payload.id).maybeSingle(),a=row.data;
   if(row.error||!a||a.purpose!=="library"||a.source_provider!==provider||a.review_status==="rejected"||!(a.owner_id===uid||(a.review_status==="approved"&&!a.adult_restricted)||(role==="owner"&&Number(member.data?.clearance_level)===7&&a.review_status==="pending")))return send(404,{ok:false,code:"MEDIA_UNAVAILABLE"});
   const path=pathFor(a.owner_id,a.id,a.mime_type);
   if(a.storage_path!==path)return send(404,{ok:false,code:"MEDIA_UNAVAILABLE"});
   const response=await fetch(zone+path,{headers:{AccessKey:key},redirect:"error",signal:AbortSignal.timeout(90000)});
   if(!response.ok||!response.body)return send(502,{ok:false,code:"BUNNY_READ_FAILED"});
   return new Response(response.body,{headers:{...headers,"Content-Type":a.mime_type,"Content-Disposition":"inline"}});
  }
  if(action!=="upload")return send(400,{ok:false,code:"INVALID_ACTION"});
  const mime=(req.headers.get("content-type")||"").toLowerCase(),category=req.headers.get("x-bc-category")||"unsorted";
  let filename;try{filename=decodeURIComponent(req.headers.get("x-bc-name")||"").replace(/[\x00-\x1f\x7f]/g,"").slice(0,180)}catch{return send(400,{ok:false,code:"INVALID_FILENAME"})}
  if(!Object.hasOwn(types,mime)||!filename||!categories.has(category))return send(422,{ok:false,code:"UNSUPPORTED_MEDIA"});
  if(Number(req.headers.get("content-length")||0)>max)return send(413,{ok:false,code:"FILE_TOO_LARGE"});
  let bytes;try{bytes=await bounded(req,max)}catch(e){return send(413,{ok:false,code:e instanceof Error?e.message:"INVALID_FILE_SIZE"})}
  const checksum=await digest(bytes),h=await digest(new TextEncoder().encode(uid+":"+checksum)),id=h.slice(0,8)+"-"+h.slice(8,12)+"-4"+h.slice(13,16)+"-8"+h.slice(17,20)+"-"+h.slice(20,32),path=pathFor(uid,id,mime);
  const existing=await db.from("corp_social_assets").select("id,owner_id,source_provider,storage_path,bytes,review_status").eq("id",id).maybeSingle();
  if(existing.error)return send(502,{ok:false,code:"CATALOG_CHECK_FAILED"});
  if(existing.data){
   if(existing.data.owner_id!==uid||existing.data.source_provider!==provider||Number(existing.data.bytes)!==bytes.byteLength)return send(409,{ok:false,code:"MEDIA_ID_CONFLICT"});
   if(existing.data.review_status==="rejected")return send(409,{ok:false,code:"PREVIOUSLY_REJECTED"});
   return send(200,{ok:true,duplicate:true,id});
  }
  const put=await fetch(zone+path,{method:"PUT",headers:{AccessKey:key,"Content-Type":mime,Checksum:checksum.toUpperCase()},body:bytes,redirect:"error",signal:AbortSignal.timeout(90000)});
  if(put.status!==201)return send(502,{ok:false,code:"BUNNY_UPLOAD_FAILED"});
  const kind=mime.startsWith("image/")?"photo":"video",tags=["maf:"+category],orientation=req.headers.get("x-bc-orientation")||"unknown";
  if(kind==="video"&&["short","standard","unknown"].includes(orientation))tags.push("bc-video-orientation:"+orientation);
  const record={id,owner_id:uid,purpose:"library",kind,mime_type:mime,filename,storage_path:path,bytes:bytes.byteLength,source_provider:provider,military_category:category==="unsorted"?"Unsorted":"Uniforms",military_branch:category==="military"?(req.headers.get("x-bc-branch")||"Unspecified").slice(0,60):"Unspecified",military_tags:tags,review_status:"pending",adult_restricted:false,rights_confirmed:role==="owner"&&Number(member.data?.clearance_level)===7&&req.headers.get("x-bc-rights")==="1",...(kind==="video"?{video_category:"standard"}:{})};
  const added=await db.from("corp_social_assets").insert(record).select("id,review_status,created_at").single();
  if(added.error)return send(502,{ok:false,code:"CATALOG_SAVE_UNCONFIRMED",detail:added.error.message.slice(0,180)});
  return send(200,{ok:true,duplicate:false,record:{...record,...added.data}});
 }catch{return send(502,{ok:false,code:"WORLD_MEDIA_REQUEST_FAILED"})}
});