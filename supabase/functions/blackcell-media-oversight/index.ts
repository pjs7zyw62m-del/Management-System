import {createClient} from "npm:@supabase/supabase-js@2.119.0";

// BLACKCELL LEVEL 7 / MEDIA OVERSIGHT
// Only BLACKCELL Photos (not REDLINE messages/files). No Bunny credentials in browsers.
const ZONE="https://la.storage.bunnycdn.com/blackcell-media-vault/blackcell-os-private-v1/";
const CHUNK=4194304,MAX_MEDIA=268435456,TABLE="bc_os_private_objects";
const ORIGINS=new Set([
 "https://blackcellcorp.com","https://www.blackcellcorp.com",
 "https://pjs7zyw62m-del.github.io"
]);
const uuid=(v:unknown)=>typeof v==="string"&&
 /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const isMedia=(path:string)=>/^Photos\/.+\.(?:jpe?g|png|webp|gif|heic|heif|mp4|m4v|mov|webm)$/i.test(path);
const unhex=(value:string)=>Uint8Array.from(value.match(/.{2}/g)!.map(x=>parseInt(x,16)));
const aad=(id:string,i:number)=>new TextEncoder().encode("blackcell-os-private-v1:"+id+":"+i);
const safeName=(path:string)=>path.split("/").pop()?.slice(0,255)||"Unknown media";
function mime(path:string):string{
 const ext=path.split(".").pop()?.toLowerCase();
 return ({jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",
 gif:"image/gif",heic:"image/heic",heif:"image/heif",mp4:"video/mp4",
 m4v:"video/mp4",mov:"video/quicktime",webm:"video/webm"} as Record<string,string>)[ext||""]||
 "application/octet-stream";
}
Deno.serve(async(request:Request)=>{
 const origin=request.headers.get("origin")||"";
 const cors={
  "Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://blackcellcorp.com",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type",
  "Access-Control-Expose-Headers":"content-length,content-type",
  "Cache-Control":"private, no-store",
  "X-Content-Type-Options":"nosniff",
  "Vary":"Origin"
 };
 const send=(data:unknown,status=200)=>new Response(JSON.stringify(data),
  {status,headers:{...cors,"Content-Type":"application/json;charset=utf-8"}});
 const fail=(code:string,status=400)=>send({ok:false,error:code},status);
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(request.method!=="POST"||(origin&&!ORIGINS.has(origin)))return fail("Operation not permitted.",403);
 const url=Deno.env.get("SUPABASE_URL")||"",
  pub=Deno.env.get("SUPABASE_ANON_KEY")||"",
  service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",
  bunnyKey=Deno.env.get("BLACKCELL_BUNNY_STORAGE_ACCESS_KEY")||"";
 if(!url||!pub||!service||!bunnyKey)return fail("Media oversight is not configured.",503);
 const bearer=request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
 if(!bearer)return fail("Sign in required.",401);
 const jwt=bearer[1],opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
 const memberClient=createClient(url,pub,{...opts,global:{headers:{Authorization:"Bearer "+jwt}}});
 const admin=createClient(url,service,opts);
 try{
  // Verify identity AND BLACKCELL Level 7 clearance, not editable user metadata.
  const {data:auth,error:authError}=await memberClient.auth.getUser(jwt);
  const actor=auth.user?.id;
  if(authError||!uuid(actor))return fail("Owner authorization required.",403);
  const {data:membership,error:membershipError}=await admin.from("corp_access_members")
   .select("role,clearance_level,active").eq("user_id",actor).maybeSingle();
  if(membershipError||!membership||membership.active!==true||
     membership.role!=="owner"||Number(membership.clearance_level)!==7)
    return fail("Level 7 owner authorization required.",403);
  const {data:verification,error:verificationError}=await memberClient.rpc("corp_code_status");
  if(verificationError||verification?.ok!==true||verification.verified!==true)
    return fail("Level 7 security verification expired.",403);

  const action=new URL(request.url).searchParams.get("action");
  let input:Record<string,unknown>;
  try{
   const raw=await request.text();
   if(raw.length>1400)return fail("Invalid request.",400);
   input=raw?JSON.parse(raw):{};
   if(!input||typeof input!=="object"||Array.isArray(input))return fail("Invalid request.");
  }catch{return fail("Invalid request.");}
  const target=typeof input.user_id==="string"?input.user_id:"";
  const fileId=typeof input.id==="string"?input.id:"";
  const log=async(kind:string,uid:string|null,id:string|null,path:string|null,reason:string|null,outcome="ok")=>{
   const {error}=await admin.rpc("corp_blackcell_media_oversight_record",{
    p_actor:actor,p_target:uid,p_object:id,p_path:path,
    p_action:kind,p_reason:reason,p_outcome:outcome
   });
   if(error)throw Error("Administrative audit log unavailable.");
  };
  const getMember=async(uid:string)=>{
   if(!uuid(uid))return false;
   const {data,error}=await admin.from("corp_access_members")
    .select("user_id").eq("user_id",uid).maybeSingle();
   if(error)throw Error("Unable to verify account.");
   return Boolean(data);
  };
  if(action==="members"){
   const {data,error}=await admin.from("corp_access_members")
    .select("user_id,display_name,username,role,active")
    .order("display_name",{ascending:true}).limit(500);
   if(error)return fail("Member directory unavailable.",502);
   await log("members",null,null,null,null);
   return send({ok:true,members:data||[]});
  }
  if(action==="recent"){
   const {data,error}=await admin.rpc("corp_blackcell_media_oversight_recent");
   if(error)return fail("Moderation history unavailable.",502);
   return send({ok:true,events:Array.isArray(data)?data:[]});
  }
  if(action==="files"){
   if(!await getMember(target))return fail("Member not found.",404);
   const page=Number(input.page??0);
   if(!Number.isInteger(page)||page<0||page>500)return fail("Invalid page.");
   const {data,error}=await admin.from(TABLE)
    .select("id,user_id,path,size_bytes,state,updated_at")
    .is("source_object_id",null).eq("user_id",target).like("path","Photos/%").in("state",["ready","deleting"])
    .order("updated_at",{ascending:false}).range(page*60,page*60+59);
   if(error)return fail("Photo catalog unavailable.",502);
   await log("files",target,null,null,null);
   return send({ok:true,files:(data||[]).filter(row=>isMedia(row.path))
    .map(row=>({id:row.id,path:row.path,name:safeName(row.path),
      mime:mime(row.path),size_bytes:Number(row.size_bytes),state:row.state,
      updated_at:row.updated_at})),page,has_more:(data||[]).length===60});
  }
  if(!["preview","read","delete","transfer"].includes(action)||!uuid(target)||!uuid(fileId))
    return fail("Invalid moderation request.",400);
  if(!await getMember(target))return fail("Member not found.",404);
  if(action==="transfer"){
   const {data,error}=await admin.rpc("bc_os_photo_permission",{p_action:"transfer",p_actor:actor,p_file:fileId,p_recipient:actor,p_target:target});
   if(error)return fail("Transfer unavailable. Verify the source photo and library quota.",409);
   return send({ok:true,...data});
  }
  const {data:row,error:rowError}=await admin.from(TABLE)
   .select("id,user_id,path,size_bytes,key_hex,state")
   .is("source_object_id",null).eq("id",fileId).eq("user_id",target).like("path","Photos/%").maybeSingle();
  if(rowError||!row||!isMedia(row.path))return fail("Media not found.",404);
  if(row.state!=="ready"&&!(action==="delete"&&row.state==="deleting"))
   return fail("This media is not available.",409);
  const bunny=async(method:"GET"|"DELETE",path:string)=>{
   return fetch(ZONE+path,{method,headers:{AccessKey:bunnyKey},
    redirect:"error",signal:AbortSignal.timeout(45000)});
  };
  if(action==="preview"){
   const response=await bunny("GET",fileId+"/thumb-v1.bin");
   if(response.status===404){await response.body?.cancel();return fail("Thumbnail is unavailable.",404);}
   if(!response.ok){await response.body?.cancel();return fail("Thumbnail cannot be loaded.",502);}
   const size=Number(response.headers.get("content-length")||0);
   if(size>524316){await response.body?.cancel();return fail("Invalid thumbnail.",502);}
   const bytes=new Uint8Array(await response.arrayBuffer());
   if(bytes.length<45||bytes.length>524316)return fail("Invalid thumbnail.",502);
   const key=await crypto.subtle.importKey("raw",unhex(row.key_hex),
    {name:"AES-GCM"},false,["decrypt"]);
   const clear=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",
    iv:bytes.subarray(0,12),additionalData:new TextEncoder()
     .encode("blackcell-os-private-v1:"+fileId+":thumbnail-v1")},
    key,bytes.subarray(12)));
   if(clear.length<19||clear[16]!==255||clear[17]!==216||clear[18]!==255)
    return fail("Invalid thumbnail.",502);
   await log("preview",target,fileId,row.path,null);
   return new Response(clear.slice(16),{headers:{...cors,"Content-Type":"image/jpeg"}});
  }
  if(action==="read"){
   const index=Number(input.index);
   const count=Math.ceil(Number(row.size_bytes)/CHUNK);
   if(!Number.isInteger(index)||index<0||index>=count||count>64||
      Number(row.size_bytes)>MAX_MEDIA)return fail("Invalid media chunk.",400);
   const expected=Math.min(CHUNK,Number(row.size_bytes)-index*CHUNK);
   const response=await bunny("GET",fileId+"/"+index+".bin");
   if(!response.ok){await response.body?.cancel();return fail("Encrypted media not available.",502);}
   const packed=new Uint8Array(await response.arrayBuffer());
   if(packed.length!==expected+28)return fail("Encrypted media length mismatch.",502);
   const key=await crypto.subtle.importKey("raw",unhex(row.key_hex),
    {name:"AES-GCM"},false,["decrypt"]);
   const clear=await crypto.subtle.decrypt({name:"AES-GCM",iv:packed.subarray(0,12),
    additionalData:aad(fileId,index)},key,packed.subarray(12));
   if(index===0)await log("read",target,fileId,row.path,null);
   return new Response(clear,{headers:{...cors,"Content-Type":"application/octet-stream"}});
  }
  const reason=typeof input.reason==="string"?input.reason.trim():"";
  const confirmation=typeof input.confirm==="string"?input.confirm:"";
  if(confirmation!=="DELETE"||reason.length<8||reason.length>500)
   return fail("Enter a moderation reason (8–500 characters) and type DELETE.",400);
  await log("delete_requested",target,fileId,row.path,reason);
  if(row.state==="ready"){
   const {data:marked,error:markError}=await admin.from(TABLE)
    .update({state:"deleting"}).eq("id",fileId).eq("user_id",target)
    .eq("state","ready").select("id");
   if(markError||!marked?.length){
    await log("delete_failed",target,fileId,row.path,reason,"failed");
    return fail("Could not safely reserve file deletion.",409);
   }
  }
  // Bunny directory DELETE also removes encrypted originals and cached thumbnails.
  const deleted=await bunny("DELETE",fileId+"/");
  await deleted.body?.cancel();
  if(!deleted.ok&&deleted.status!==404){
   await log("delete_failed",target,fileId,row.path,reason,"failed");
   return fail("Bunny did not confirm deletion; retry this item.",502);
  }
  const {data:removed,error:removeError}=await admin.from(TABLE)
   .delete().eq("id",fileId).eq("user_id",target).eq("state","deleting").select("id");
  if(removeError||!removed?.length){
   await log("delete_failed",target,fileId,row.path,reason,"failed");
   return fail("Media deleted; catalog cleanup requires a retry.",502);
  }
  await log("deleted",target,fileId,row.path,reason);
  return send({ok:true,deleted:true,id:fileId});
 }catch(err){
  // No internal stack traces, encryption keys, or service credentials to clients.
  return fail(err instanceof Error&&err.message==="Administrative audit log unavailable."
   ?err.message:"Unable to complete owner media oversight request.",502);
 }
});