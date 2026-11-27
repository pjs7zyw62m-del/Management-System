import {createClient} from "npm:@supabase/supabase-js@2.119.0";
// Staged server-to-server REDLINE photo export. No deletion here.
const ROOT="https://la.storage.bunnycdn.com/blackcell-media-vault/";
const CHUNK=4194304, MAX=12582912;
const origins=new Set(["https://blackcellcorp.com","https://www.blackcellcorp.com","https://pjs7zyw62m-del.github.io"]);
const uuid=(x:unknown):x is string=>typeof x==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
const hex=(bytes:Uint8Array)=>Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
const unhex=(v:string)=>Uint8Array.from(v.match(/.{2}/g)!.map(x=>parseInt(x,16)));
const digest=async(v:Uint8Array)=>hex(new Uint8Array(await crypto.subtle.digest("SHA-256",v)));
async function bounded(response:Response,max:number){
 if(!response.ok||!response.body)throw Error("SOURCE_UNAVAILABLE");
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();throw Error("FILE_TOO_LARGE")}parts.push(value)}}finally{reader.releaseLock()}
 if(!length)throw Error("EMPTY_FILE");
 const bytes=new Uint8Array(length);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length}return bytes;
}
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 const headers={"Access-Control-Allow-Origin":origins.has(origin)?origin:"https://blackcellcorp.com","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Cache-Control":"private,no-store","Content-Type":"application/json","Vary":"Origin"};
 const send=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 const fail=(code:string,status=400)=>send({ok:false,code},status);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST"||(origin&&!origins.has(origin)))return fail("REQUEST_DENIED",403);
 const url=Deno.env.get("SUPABASE_URL")||"",pub=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",secret=Deno.env.get("BLACKCELL_BUNNY_STORAGE_ACCESS_KEY")||"";
 const jwt=req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
 if(!jwt)return fail("SIGN_IN_REQUIRED",401);
 if(!url||!pub||!service||!secret)return fail("STORAGE_UNAVAILABLE",503);
 const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
 const member=createClient(url,pub,{...opts,global:{headers:{Authorization:"Bearer "+jwt}}}),admin=createClient(url,service,opts);
 try{
  const identity=await member.auth.getUser(jwt),uid=identity.data.user?.id;
  if(identity.error||!uuid(uid))return fail("SIGN_IN_REQUIRED",401);
  const verified=await member.rpc("corp_owner_validated");
  if(verified.error||verified.data!==true)return fail("OWNER_VERIFICATION_REQUIRED",403);
  const body=await req.json();
  if(body?.action==="cleanup"){
   const room=body.room_id??null;
   if(room!==null&&!uuid(room))return fail("INVALID_ROOM");
   const batch=await admin.rpc("corp_redline_source_cleanup_batch",{p_owner:uid,p_room:room});
   if(batch.error||!Array.isArray(batch.data))return fail("CLEANUP_QUEUE_UNAVAILABLE",502);
   let removed=0;
   for(const item of batch.data){
    if(!uuid(item.room_id)||typeof item.source_path!=="string"||
      !new RegExp("^redline/v1/"+item.room_id+"/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp|heic|heif)$").test(item.source_path))return fail("UNSAFE_SOURCE_PATH",409);
    const result=await fetch(ROOT+item.source_path,{method:"DELETE",headers:{AccessKey:secret},redirect:"error",signal:AbortSignal.timeout(10000)});
    await result.body?.cancel();
    if(!result.ok&&result.status!==404)return fail("SOURCE_CLEANUP_RETRY",502);
    const ack=await admin.rpc("corp_redline_source_cleanup_finish",{p_owner:uid,p_room:item.room_id,p_path:item.source_path});
    if(ack.error)return fail("SOURCE_CLEANUP_ACK_RETRY",502);
    removed++;
   }
   return send({ok:true,removed,more:batch.data.length===20});
  }
  if(!uuid(body?.room_id)||!uuid(body?.photo_id))return fail("INVALID_ROOM_OR_PHOTO");
  const roomId=body.room_id,photoId=body.photo_id;
  const room=await member.from("corp_private_photo_rooms").select("id,owner_id,member_id,active").eq("id",roomId).maybeSingle();
  if(room.error||!room.data||room.data.owner_id!==uid||room.data.active)return fail("CLOSED_OWNED_ROOM_REQUIRED",403);
  const sender=room.data.member_id;
  if(!uuid(sender))return fail("INVALID_PARTICIPANT");
  const photo=await member.from("corp_private_photo_entries").select("id,room_id,uploaded_by,image_path,decision_status").eq("id",photoId).eq("room_id",roomId).maybeSingle();
  if(photo.error||!photo.data||photo.data.uploaded_by!==sender)return fail("PHOTO_NOT_AUTHORIZED",403);
  const guard=await member.rpc("corp_redline_photo_removal_check",{p_room_id:roomId,p_photo_id:photoId});
  if(guard.error||guard.data?.ok!==true||guard.data?.blocked===true)return fail("PHOTO_REMOVED_OR_UNAVAILABLE",409);
  const path=photo.data.image_path;
  if(typeof path!=="string"||!new RegExp("^redline/v1/"+roomId+"/"+sender+"/"+photoId+"[.](jpg|png|webp|heic|heif)$").test(path))return fail("LEGACY_PHOTO_REQUIRES_RECOVERY",409);
  const bunny=(path:string,method:"GET"|"PUT",bytes?:Uint8Array,checksum?:string)=>fetch(ROOT+path,{method,headers:{AccessKey:secret,...(bytes?{"Content-Type":"application/octet-stream",Checksum:checksum||""}:{})},...(bytes?{body:bytes}:{}),redirect:"error",signal:AbortSignal.timeout(25000)});
  const source=await bounded(await bunny(path,"GET"),MAX);
  const recipients=photo.data.decision_status==="accepted"?[sender,uid]:[sender];
  for(const recipient of recipients){
   const reserve=await admin.rpc("corp_redline_reserve_session_photo_export",{p_room:roomId,p_photo:photoId,p_recipient:recipient,p_size:source.length,p_key:hex(crypto.getRandomValues(new Uint8Array(32)))});
   if(reserve.error||!uuid(reserve.data))return fail("LIBRARY_RESERVATION_FAILED",409);
   const id=reserve.data;
   const row=await admin.from("bc_os_private_objects").select("id,user_id,size_bytes,key_hex,state,source_object_id").eq("id",id).eq("user_id",recipient).maybeSingle();
   if(row.error||!row.data||row.data.source_object_id||Number(row.data.size_bytes)!==source.length||!["uploading","ready"].includes(row.data.state))return fail("LIBRARY_RESERVATION_MISMATCH",409);
   const key=await crypto.subtle.importKey("raw",unhex(row.data.key_hex),{name:"AES-GCM"},false,["encrypt","decrypt"]);
   for(let i=0;i<Math.ceil(source.length/CHUNK);i++){
    const clear=source.subarray(i*CHUNK,Math.min(source.length,(i+1)*CHUNK));
    const aad=new TextEncoder().encode("blackcell-os-private-v1:"+id+":"+i),dest="blackcell-os-private-v1/"+id+"/"+i+".bin";
    if(row.data.state==="uploading"){
     const iv=crypto.getRandomValues(new Uint8Array(12));
     const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:aad},key,clear));
     const packed=new Uint8Array(12+encrypted.length);packed.set(iv);packed.set(encrypted,12);
     const put=await bunny(dest,"PUT",packed,await digest(packed));await put.body?.cancel();
     if(!put.ok)return fail("LIBRARY_WRITE_FAILED",502);
    }
    const stored=await bounded(await bunny(dest,"GET"),clear.length+28);
    if(stored.length!==clear.length+28)return fail("LIBRARY_READBACK_FAILED",502);
    const restored=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:stored.subarray(0,12),additionalData:aad},key,stored.subarray(12)));
    if(await digest(restored)!==await digest(clear))return fail("LIBRARY_CHECKSUM_MISMATCH",502);
    if(row.data.state==="uploading"){
     const mark=await admin.rpc("bc_os_private_mark_chunk",{p_uid:recipient,p_id:id,p_index:i});
     if(mark.error||mark.data!==true)return fail("LIBRARY_CHUNK_NOT_CONFIRMED",409);
    }
   }
   if(row.data.state==="uploading"){
    const finish=await admin.rpc("bc_os_private_finish",{p_uid:recipient,p_id:id});
    if(finish.error||finish.data!==true)return fail("LIBRARY_TRANSFER_NOT_CONFIRMED",409);
   }
  }
  return send({ok:true,photo_id:photoId,verified_library_copies:recipients.length});
 }catch{return fail("TRANSFER_INCOMPLETE_RETRY",502)}
});
