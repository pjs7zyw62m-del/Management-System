import {createClient} from "npm:@supabase/supabase-js@2.119.0";

/* BLACKCELL REDLINE dedicated private Bunny storage transport.
   Auth + two-party room authorization still come from Supabase.
   ONLY the media bytes are saved in Bunny Storage; no CDN or public URL.
   Existing Supabase photo-history metadata is preserved unmodified. */
const root="https://la.storage.bunnycdn.com/blackcell-media-vault/";
const prefix="redline/v1/";
const maxBytes=12*1024*1024;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowed:Record<string,string>={
 "image/jpeg":"jpg","image/png":"png","image/webp":"webp",
 "image/heic":"heic","image/heif":"heif"
};
const origins=new Set([
 "https://blackcellcorp.com","https://www.blackcellcorp.com",
 "https://pjs7zyw62m-del.github.io"
]);
const cors=(origin:string)=>({
 "Access-Control-Allow-Origin":origins.has(origin)?origin:"https://blackcellcorp.com",
 "Access-Control-Allow-Methods":"POST,OPTIONS",
 "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-bc-room,x-bc-photo-id",
 "Access-Control-Expose-Headers":"content-type,content-length",
 "Cache-Control":"private, no-store","Vary":"Origin",
 "X-Content-Type-Options":"nosniff"
});
function reply(origin:string,status:number,code:string){
 return new Response(JSON.stringify({ok:false,code}),{
  status,headers:{...cors(origin),"Content-Type":"application/json;charset=utf-8"}
 });
}
function success(origin:string,data:Record<string,unknown>,status=200){
 return new Response(JSON.stringify({ok:true,...data}),{
  status,headers:{...cors(origin),"Content-Type":"application/json;charset=utf-8"}
 });
}
async function limited(req:Request,max:number){
 if(!req.body)throw Error("EMPTY_FILE");
 const reader=req.body.getReader(),parts:Uint8Array[]=[];let n=0;
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   n+=value.byteLength;
   if(n>max){await reader.cancel();throw Error("PHOTO_EXCEEDS_12_MB")}
   parts.push(value);
  }
 }finally{reader.releaseLock()}
 if(n<1)throw Error("EMPTY_FILE");
 const buf=new Uint8Array(n);let offset=0;
 for(const v of parts){buf.set(v,offset);offset+=v.length}
 return buf;
}
function hasPhotoMagic(bytes:Uint8Array,mime:string){
 const starts=(xs:number[])=>xs.every((x,i)=>bytes[i]===x);
 if(mime==="image/jpeg")return starts([255,216,255]);
 if(mime==="image/png")return starts([137,80,78,71,13,10,26,10]);
 if(mime==="image/webp")return String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&
  String.fromCharCode(...bytes.slice(8,12))==="WEBP";
 if((mime==="image/heic"||mime==="image/heif")&&bytes.length>12){
  const type=String.fromCharCode(...bytes.slice(4,8));
  const brand=String.fromCharCode(...bytes.slice(8,12));
  return type==="ftyp"&&["heic","heix","hevc","hevx","mif1","msf1"].includes(brand);
 }
 return false;
}
function secretConfig(){
 const host=Deno.env.get("SUPABASE_URL")||"";
 let pub=Deno.env.get("SUPABASE_ANON_KEY")||"";
 if(!pub)try{
  pub=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default||"";
 }catch{ /* fail closed below */ }
 const accessKey=Deno.env.get("BLACKCELL_BUNNY_STORAGE_ACCESS_KEY")?.trim()||"";
 return {host,pub,accessKey};
}
function pathFor(room:string,member:string,photo:string,mime:string){
 if(!uuid.test(room)||!uuid.test(member)||!uuid.test(photo)||!(mime in allowed))
  throw Error("INVALID_PHOTO_PATH");
 return prefix+room+"/"+member+"/"+photo+"."+allowed[mime];
}
const bunny=(path:string,key:string,method:"GET"|"PUT"|"DELETE",bytes?:Uint8Array,mime?:string)=>
 fetch(root+path,{method,headers:{"AccessKey":key,...(mime?{"Content-Type":mime}:{})},
  ...(bytes?{body:bytes}:{}),redirect:"error",signal:AbortSignal.timeout(30000)});
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
 if(req.method!=="POST")return reply(origin,405,"POST_REQUIRED");
 if(origin&&!origins.has(origin))return reply(origin,403,"ORIGIN_DENIED");
 const {host,pub,accessKey}=secretConfig();
 if(!host||!pub||!accessKey)return reply(origin,503,"BUNNY_REDLINE_NOT_CONFIGURED");
 const auth=req.headers.get("authorization")||"";
 if(!/^Bearer\s+\S+$/i.test(auth))return reply(origin,401,"SIGN_IN_REQUIRED");
 const jwt=auth.replace(/^Bearer\s+/i,"").trim();
 const db=createClient(host,pub,{global:{headers:{Authorization:"Bearer "+jwt}},
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 try{
  const identity=await db.auth.getUser(jwt),uid=identity.data.user?.id;
  if(identity.error||!uid||!uuid.test(uid))return reply(origin,401,"SIGN_IN_REQUIRED");
  const action=new URL(req.url).searchParams.get("action")||"";
  let roomId="",photoId="";
  if(action==="upload"){
   roomId=req.headers.get("x-bc-room")||"";
   photoId=req.headers.get("x-bc-photo-id")||"";
  }else{
   const body=await req.json();
   roomId=typeof body?.room_id==="string"?body.room_id:"";
   photoId=typeof body?.photo_id==="string"?body.photo_id:"";
  }
  if(!uuid.test(roomId)||!uuid.test(photoId))
   return reply(origin,400,"INVALID_ROOM_OR_PHOTO_ID");
  const {data:room,error:roomError}=await db.from("corp_private_photo_rooms")
   .select("id,owner_id,member_id,active,photo_sending_paused")
   .eq("id",roomId).maybeSingle();
  if(roomError||!room||(room.owner_id!==uid&&room.member_id!==uid))
   return reply(origin,403,"PRIVATE_ROOM_DENIED");
  const verify=await db.rpc(room.owner_id===uid?"corp_code_status":"corp_employee_code_status");
  if(verify.error||verify.data?.ok!==true||verify.data?.verified!==true)
   return reply(origin,403,"REDLINE_SECURITY_VERIFICATION_REQUIRED");

  if(action==="upload"){
   if(uid!==room.member_id||!room.active||room.photo_sending_paused)
    return reply(origin,403,"PHOTO_SENDING_NOT_ALLOWED");
   const mime=(req.headers.get("content-type")||"").toLowerCase().split(";")[0].trim();
   if(!(mime in allowed))return reply(origin,415,"UNSUPPORTED_PHOTO_TYPE");
   if(Number(req.headers.get("content-length")||0)>maxBytes)
    return reply(origin,413,"PHOTO_EXCEEDS_12_MB");
   let bytes:Uint8Array;
   try{bytes=await limited(req,maxBytes)}
   catch(e){return reply(origin,413,String((e as Error).message))}
   if(!hasPhotoMagic(bytes,mime))return reply(origin,415,"PHOTO_SIGNATURE_MISMATCH");
   const existing=await db.from("corp_private_photo_entries")
    .select("id").eq("id",photoId).maybeSingle();
   if(existing.error||existing.data)return reply(origin,409,"PHOTO_ID_ALREADY_EXISTS");
   const path=pathFor(roomId,uid,photoId,mime);
   const put=await bunny(path,accessKey,"PUT",bytes,mime);
   if(put.status!==201)return reply(origin,502,"BUNNY_UPLOAD_FAILED");
   return success(origin,{path,bytes:bytes.byteLength,photo_id:photoId,provider:"bunny-redline-v1"});
  }

  if(action==="delete"){
   // Only the verified REDLINE receiver can purge a posted private photo.
   // Prepare first places a database tombstone that immediately blocks reads.
   if(uid!==room.owner_id)return reply(origin,403,"RECEIVER_ONLY_DELETE");
   const begin=await db.rpc("corp_redline_photo_remove_begin",{
    p_room_id:roomId,p_photo_id:photoId
   });
   if(begin.error||begin.data?.ok!==true)
    return reply(origin,409,String(begin.data?.reason||"DELETE_AUTHORIZATION_FAILED"));
   if(begin.data.status==="removed")
    return success(origin,{photo_id:photoId,status:"removed",already_removed:true});
   const path=begin.data.path;
   if(typeof path!=="string")return reply(origin,500,"REMOVAL_PATH_UNAVAILABLE");
   const prefixForPhoto=prefix+roomId+"/"+room.member_id+"/"+photoId+".";
   if(path.startsWith(prefix)){
    if(!path.startsWith(prefixForPhoto)||
      !Object.values(allowed).includes(path.slice(prefixForPhoto.length))||
      path.slice(prefixForPhoto.length).includes("/"))
     return reply(origin,400,"DELETE_PATH_MISMATCH");
    const removed=await bunny(path,accessKey,"DELETE");
    if(!removed.ok&&removed.status!==404)
     return reply(origin,502,"BUNNY_DELETE_NOT_CONFIRMED_RETRY");
   }else{
    // Old Supabase photos have already been manually erased. If a legacy
    // object still exists, require confirmed deletion before marking removed.
    if(!new RegExp("^"+roomId+"/"+photoId+"[.](jpg|jpeg|png|webp|heic|heif)$","i").test(path))
     return reply(origin,400,"LEGACY_DELETE_PATH_INVALID");
    if(begin.data.legacy_object_exists===true){
     const removed=await db.storage.from("corp-private-photo-ledger").remove([path]);
     if(removed.error)return reply(origin,502,"LEGACY_DELETE_NOT_CONFIRMED_RETRY");
    }
   }
   const final=await db.rpc("corp_redline_photo_remove_finish",{
    p_room_id:roomId,p_photo_id:photoId
   });
   if(final.error||final.data?.ok!==true)
    return reply(origin,503,"FILE_PURGED_BUT_LEDGER_CONFIRMATION_PENDING_RETRY");
   return success(origin,{photo_id:photoId,status:"removed",removed_at:final.data.removed_at});
  }
  if(action==="read"){
   const guard=await db.rpc("corp_redline_photo_removal_check",{
    p_room_id:roomId,p_photo_id:photoId
   });
   if(guard.error||guard.data?.ok!==true)
    return reply(origin,403,"PHOTO_REMOVAL_GUARD_UNAVAILABLE");
   if(guard.data.blocked===true)return reply(origin,410,"PHOTO_PERMANENTLY_REMOVED");
   const {data:entry,error}=await db.from("corp_private_photo_entries")
    .select("id,room_id,uploaded_by,image_path")
    .eq("id",photoId).eq("room_id",roomId).maybeSingle();
   if(error||!entry||typeof entry.image_path!=="string"||
    !entry.image_path.startsWith(prefix+roomId+"/")||
    !entry.image_path.startsWith(prefix+roomId+"/"+room.member_id+"/"))
    return reply(origin,404,"PRIVATE_PHOTO_NOT_FOUND");
   const file=await bunny(entry.image_path,accessKey,"GET");
   if(!file.ok||!file.body)return reply(origin,404,"BUNNY_PHOTO_UNAVAILABLE");
   // Bunny may send application/octet-stream even for image objects.
   // The verified, immutable file path gives us the approved image MIME.
   const ext=entry.image_path.split(".").pop();
   const type=Object.entries(allowed).find(([,suffix])=>suffix===ext)?.[0]||"application/octet-stream";
   return new Response(file.body,{
    status:200,headers:{...cors(origin),"Content-Type":type}
   });
  }
  if(action==="cleanup"){
   if(uid!==room.member_id)return reply(origin,403,"SENDER_REQUIRED");
   const {data:entry,error:entryError}=await db.from("corp_private_photo_entries")
    .select("id").eq("id",photoId).maybeSingle();
   if(entryError)return reply(origin,503,"PHOTO_REFERENCE_CHECK_FAILED");
   if(entry)return reply(origin,409,"PHOTO_ALREADY_RECORDED");
   // Cleanup can only touch the caller's own temporary upload; no published
   // photo file or another user's media can be deleted.
   for(const mime of Object.keys(allowed)){
    const path=pathFor(roomId,uid,photoId,mime);
    const removed=await bunny(path,accessKey,"DELETE");
    if(!removed.ok&&removed.status!==404)return reply(origin,502,"BUNNY_CLEANUP_FAILED");
   }
   return success(origin,{photo_id:photoId});
  }
  return reply(origin,400,"UNKNOWN_ACTION");
 }catch(e){
  // Never include secrets, file paths, or private record data in error text.
  console.error("redline bunny:",e instanceof Error?e.message:"unknown");
  return reply(origin,500,"PRIVATE_MEDIA_OPERATION_FAILED");
 }
});