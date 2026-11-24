import {createClient} from "npm:@supabase/supabase-js@2.119.0";
const ZONE="https://la.storage.bunnycdn.com/blackcell-media-vault/blackcell-os-private-v1/";
const CHUNK=4194304,MAX=268435456,TABLE="bc_os_private_objects";
const origins=new Set(["https://blackcellcorp.com","https://www.blackcellcorp.com","https://pjs7zyw62m-del.github.io"]);
const uuid=(x:unknown)=>typeof x==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
function pathValid(x:unknown):x is string{return typeof x==="string"&&x.length<=4000&&x.split("/").length<=51&&x.split("/").every(s=>s.length>0&&s.length<=255&&s!=="."&&s!==".."&&s!==".blackcell-folder"&&!/[\x00-\x1f\x7f\\]/.test(s))}
const hex=(v:Uint8Array)=>Array.from(v,x=>x.toString(16).padStart(2,"0")).join("");
function unhex(x:string){return Uint8Array.from(x.match(/.{2}/g)!.map(v=>parseInt(v,16)))}
const aad=(id:string,i:number)=>new TextEncoder().encode("blackcell-os-private-v1:"+id+":"+i);
async function bounded(req:Request,n:number){
 const length=req.headers.get("content-length");if(length!==null&&Number(length)!==n)throw Error("Incorrect chunk length.");
 if(!req.body)throw Error("Missing chunk.");
 const out=new Uint8Array(n);const reader=req.body.getReader();let offset=0;try{while(true){const {value,done}=await reader.read();if(done)break;if(offset+value.length>n){await reader.cancel();throw Error("Chunk exceeds expected size.");}out.set(value,offset);offset+=value.length}}finally{reader.releaseLock()}if(offset!==n)throw Error("Incomplete chunk.");return out;
}
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 const headers={"Access-Control-Allow-Origin":origins.has(origin)?origin:"https://blackcellcorp.com","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-bc-id,x-bc-index","Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff","Vary":"Origin"};
 const send=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...headers,"Content-Type":"application/json"}});
 const fail=(error:string,status=400)=>send({ok:false,error},status);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST"||(origin&&!origins.has(origin)))return fail("Request not allowed.",403);
 const url=Deno.env.get("SUPABASE_URL")||"",pub=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",secret=Deno.env.get("BLACKCELL_BUNNY_STORAGE_ACCESS_KEY")?.trim()||"";
 if(!url||!pub||!service||!secret)return fail("Cloud storage configuration unavailable.",503);
 const match=req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);if(!match)return fail("Sign in required.",401);
 const jwt=match[1],opt={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
 const client=createClient(url,pub,{...opt,global:{headers:{Authorization:"Bearer "+jwt}}}),db=createClient(url,service,opt);
 try{
  const who=await client.auth.getUser(jwt);const uid=who.data.user?.id;if(who.error||!uid)return fail("Sign in required.",401);
  const {data:m,error:me}=await db.from("corp_access_members").select("role,active,clearance_level,password_activated_at,access_scope").eq("user_id",uid).eq("active",true).maybeSingle();
  if(me||!m)return fail("Corporate access denied.",403);
  const owner=m.role==="owner"&&Number(m.clearance_level)===7,employee=m.role==="employee"&&!!m.password_activated_at&&m.access_scope!=="ledger_only";
  if(!owner&&!employee)return fail("Corporate access denied.",403);
  const ver=await client.rpc(owner?"corp_code_status":"corp_employee_code_status");if(ver.error||ver.data?.ok!==true||ver.data?.verified!==true)return fail("Verify corporate access.",403);
  const action=new URL(req.url).searchParams.get("action");
  const bunny=async(method:string,id:string,index?:number|string,body?:Uint8Array)=>{
   const path=id+"/"+(index===undefined?"":String(index)+".bin");
   return fetch(ZONE+path,{method,headers:{AccessKey:secret,...(body?{"Content-Type":"application/octet-stream",Checksum:hex(new Uint8Array(await crypto.subtle.digest("SHA-256",body)))}:{})},...(body?{body}:{}),redirect:"error",signal:AbortSignal.timeout(45000)});
  };
  if(action==="list"){
   const rows=[];for(let offset=0;offset<5000;offset+=500){const {data,error}=await db.from(TABLE).select("id,path,size_bytes,updated_at,state").eq("user_id",uid).in("state",["ready","deleting"]).order("path").range(offset,offset+499);if(error)return fail("Unable to load private drive.",502);rows.push(...(data||[]));if((data||[]).length<500)break}
   return send({ok:true,rows});
  }
  if(action==="usage"||action==="status"){
   const {data:usage,error}=await db.rpc("bc_os_private_usage",{p_uid:uid});if(error||!usage)return fail("Unable to check storage usage.",502);
   if(action==="usage")return send({ok:true,...usage});
   let connected=false;try{
    const r=await fetch(ZONE,{headers:{AccessKey:secret,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(12000)});await r.body?.cancel();connected=r.ok;
    if(r.status===404){const root=await fetch("https://la.storage.bunnycdn.com/blackcell-media-vault/",{headers:{AccessKey:secret,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(12000)});connected=root.ok;await root.body?.cancel()}
   }catch{}
   return send({ok:true,configured:true,connected,...usage,chunkBytes:CHUNK});
  }
  const raw=action==="chunk"||action==="preview-write"?null:await req.text();if(raw&&raw.length>12000)return fail("Invalid request.");
  const body=raw?JSON.parse(raw):{};
  if(action==="photo-permission-info"||action==="photo-permission-approve"){
   if(!uuid(body.id)||!uuid(body.recipient))return fail("Invalid permission link.");
   const {data,error}=await db.rpc("bc_os_photo_permission",{p_action:action==="photo-permission-info"?"info":"approve",p_actor:uid,p_file:body.id,p_recipient:body.recipient,p_target:uid});
   if(error)return fail("This photo permission link is unavailable for your account.",403);
   return send({ok:true,...data});
  }
  if(action==="start"){
   const path=body.path,size=body.size;if(!pathValid(path)||!Number.isSafeInteger(size)||size<=0||size>MAX)return fail("Choose a file up to 256 MB with a valid name.");
   const key=hex(crypto.getRandomValues(new Uint8Array(32)));
   const {data,error}=await db.rpc("bc_os_private_reserve",{p_uid:uid,p_path:path,p_size:size,p_key:key});if(error||!uuid(data))return fail(error?.message?.includes("quota")?"Private drive test quota reached (2 GiB).":error?.message?.includes("exists")?"A file or folder with that name already exists.":"Could not reserve private upload.",409);
   return send({ok:true,id:data,chunkBytes:CHUNK});
  }
  if(action==="lookup"){
   if(!pathValid(body.path))return fail("Invalid file path.");
   const {data,error}=await db.from(TABLE).select("id,path,size_bytes,updated_at,state").eq("user_id",uid).eq("path",body.path).in("state",["ready","deleting"]).maybeSingle();
   if(error)return fail("Private catalog unavailable.",502);return send({ok:true,row:data||null});
  }
  const id=action==="chunk"||action==="preview-write"?req.headers.get("x-bc-id"):body.id;
  if(!uuid(id))return fail("Invalid file identifier.");
  const {data:row,error:re}=await db.from(TABLE).select("id,user_id,path,size_bytes,state,received,key_hex,source_object_id").eq("id",id).eq("user_id",uid).maybeSingle();
  if(re||!row)return fail("Private file not found.",404);
  // An authorized library reference has its own catalog identity, but all
  // encrypted bytes and thumbnail AAD retain the source object's identity.
  let mediaId=id,mediaKey=row.key_hex;
  if(row.source_object_id){
   if(action==="delete"){
    if(row.state!=="ready")return fail("Reference unavailable.",409);
    const {error}=await db.from(TABLE).delete().eq("id",id).eq("user_id",uid).eq("source_object_id",row.source_object_id);
    if(error)return fail("Could not remove library reference.",502);
    return send({ok:true});
   }
   if(action==="preview-write")return send({ok:true});
   if(!["move","read","preview-read"].includes(action))return fail("Reference cannot be modified.",409);
   const {data:source,error}=await db.from(TABLE).select("id,size_bytes,key_hex,state,source_object_id").eq("id",row.source_object_id).maybeSingle();
   if(error||!source||source.state!=="ready"||source.source_object_id||source.size_bytes!==row.size_bytes)return fail("Original photo unavailable.",404);
   mediaId=source.id;mediaKey=source.key_hex;
  }
  if(action==="move"){
   if(row.state!=="ready"||!pathValid(body.path))return fail("Invalid destination.");
   const {data,error}=await db.rpc("bc_os_private_move",{p_uid:uid,p_id:id,p_path:body.path});if(error||data!==true)return fail("Destination already exists or the file could not be moved.",409);return send({ok:true});
  }
  if(action==="finish"){
   if(row.state==="ready")return send({ok:true});
   const {data,error}=await db.rpc("bc_os_private_finish",{p_uid:uid,p_id:id});if(error||data!==true)return fail("Upload is incomplete.",409);return send({ok:true});
  }
  if(action==="cancel"||action==="delete"){
   if(action==="cancel"&&row.state!=="uploading")return fail("Only incomplete uploads can be canceled.",409);
   if(action==="delete"&&!["ready","deleting"].includes(row.state))return fail("File unavailable.",409);
   const {error}=await db.from(TABLE).update({state:"deleting"}).eq("id",id).eq("user_id",uid).eq("state",row.state);if(error)return fail("Could not prepare removal.",502);
   const result=await bunny("DELETE",id);await result.body?.cancel();if(!result.ok&&result.status!==404)return fail("Bunny could not confirm deletion. Retry the removal.",502);
   const removed=await db.from(TABLE).delete().eq("id",id).eq("user_id",uid).eq("state","deleting");if(removed.error)return fail("Storage deleted; catalog cleanup needs a retry.",502);return send({ok:true});
  }
  // One bounded encrypted thumbnail per original, in the same Bunny directory.
  // The original's existing folder deletion removes derivatives as well.
  if(action==="preview-read"||action==="preview-write"){
   if(row.state!=="ready"||!/\.(jpe?g|png|webp|gif|heic|heif|mp4|m4v|mov|webm)$/i.test(row.path))return fail("Media preview unavailable.",404);
   const MAX_PREVIEW=524288,slot="thumb-v1";
   const key=await crypto.subtle.importKey("raw",unhex(mediaKey),{name:"AES-GCM"},false,["encrypt","decrypt"]);
   const previewAAD=new TextEncoder().encode("blackcell-os-private-v1:"+mediaId+":thumbnail-v1");
   if(action==="preview-read"){
    const r=await bunny("GET",mediaId,slot);
    if(r.status===404){await r.body?.cancel();return fail("Preview not generated.",404)}
    if(!r.ok){await r.body?.cancel();return fail("Preview unavailable.",502)}
    const length=Number(r.headers.get("content-length")||0);
    if(length>MAX_PREVIEW+28){await r.body?.cancel();return fail("Invalid preview.",502)}
    const packed=new Uint8Array(await r.arrayBuffer());
    if(packed.length<45||packed.length>MAX_PREVIEW+28)return fail("Invalid preview.",502);
    const clear=await crypto.subtle.decrypt({name:"AES-GCM",iv:packed.subarray(0,12),additionalData:previewAAD},key,packed.subarray(12));
    return new Response(clear,{headers:{...headers,"Content-Type":"application/octet-stream"}});
   }
   const n=Number(req.headers.get("x-bc-index"));
   if(!Number.isSafeInteger(n)||n<20||n>MAX_PREVIEW)return fail("Thumbnail exceeds supported size.");
   const bytes=await bounded(req,n),meta=new DataView(bytes.buffer,bytes.byteOffset,16);
   const ratio=meta.getFloat64(0),duration=meta.getFloat64(8);
   if(!Number.isFinite(ratio)||ratio<=0||ratio>100||ratio<.01||(!Number.isFinite(duration)&&!Number.isNaN(duration))||duration<0||bytes[16]!==255||bytes[17]!==216||bytes[18]!==255)return fail("Invalid JPEG thumbnail.");
   const iv=crypto.getRandomValues(new Uint8Array(12));
   const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:previewAAD},key,bytes)),packed=new Uint8Array(iv.length+encrypted.length);
   packed.set(iv);packed.set(encrypted,iv.length);
   const result=await bunny("PUT",id,slot,packed);await result.body?.cancel();
   if(!result.ok)return fail("Cloud thumbnail could not be saved.",502);
   const check=await db.from(TABLE).select("id").eq("id",id).eq("user_id",uid).eq("state","ready").maybeSingle();
   if(check.error||!check.data){const cleanup=await bunny("DELETE",id,slot);await cleanup.body?.cancel();return fail("Original unavailable.",409)}
   return send({ok:true});
  }
  const i=action==="chunk"?Number(req.headers.get("x-bc-index")):body.index;
  if(!Number.isInteger(i)||i<0||i>=Math.ceil(Number(row.size_bytes)/CHUNK))return fail("Invalid chunk.");
  const n=Math.min(CHUNK,Number(row.size_bytes)-i*CHUNK);
  const key=await crypto.subtle.importKey("raw",unhex(mediaKey),{name:"AES-GCM"},false,["encrypt","decrypt"]);
  if(action==="chunk"){
   if(row.state!=="uploading")return fail("Upload is not open.",409);
   const bytes=await bounded(req,n);const iv=crypto.getRandomValues(new Uint8Array(12));
   const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:aad(id,i)},key,bytes));const packed=new Uint8Array(iv.length+encrypted.length);packed.set(iv);packed.set(encrypted,iv.length);
   const r=await bunny("PUT",id,i,packed);await r.body?.cancel();if(!r.ok)return fail("Bunny rejected the upload chunk.",502);
   const marked=await db.rpc("bc_os_private_mark_chunk",{p_uid:uid,p_id:id,p_index:i});if(marked.error||marked.data!==true)return fail("Could not register uploaded chunk.",409);
   return send({ok:true,index:i});
  }
  if(action==="read"){
   if(row.state!=="ready")return fail("File unavailable.",409);
   const r=await bunny("GET",mediaId,i);if(!r.ok){await r.body?.cancel();return fail("Private media could not be retrieved.",502)}
   const packed=new Uint8Array(await r.arrayBuffer());if(packed.length!==n+28)return fail("Stored chunk length mismatch.",502);
   const clear=await crypto.subtle.decrypt({name:"AES-GCM",iv:packed.subarray(0,12),additionalData:aad(mediaId,i)},key,packed.subarray(12));
   return new Response(clear,{headers:{...headers,"Content-Type":"application/octet-stream"}});
  }
  return fail("Unknown action.");
 }catch(_){return fail("Private storage operation failed. Please retry.",502)}
});