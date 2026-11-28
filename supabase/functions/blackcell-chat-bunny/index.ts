import {createClient} from "npm:@supabase/supabase-js@2.119.0";

// Dedicated token-protected Bunny Pull Zone; deployment gated by owner cutover secret.
// No browser receives a storage credential. All access is checked via caller RLS.
// Proposed isolated storage zone, not the existing shared media vault.
const zone="https://la.storage.bunnycdn.com/blackcell-private-chat/";
const prefix="blackcell-private-chat/v1/";
const max=50*1024*1024;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const types:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif","image/heic":"heic","image/heif":"heif","image/heic-sequence":"heics","image/heif-sequence":"heifs","image/avif":"avif","video/mp4":"mp4","video/webm":"webm","video/quicktime":"mov","video/x-m4v":"m4v","audio/webm":"webm","audio/mp4":"m4a","audio/ogg":"ogg"};
const allowed=new Set(["https://blackcellcorp.com","https://www.blackcellcorp.com","https://pjs7zyw62m-del.github.io"]);
const enc=new TextEncoder();
const hex=(a:ArrayBuffer)=>Array.from(new Uint8Array(a),x=>x.toString(16).padStart(2,"0")).join("");
const hash=async(a:ArrayBuffer)=>hex(await crypto.subtle.digest("SHA-256",a));
function keyFor(sender:string,recipient:string,batch:string,item:string,mime:string){
 if(![sender,recipient,batch,item].every(x=>uuid.test(x))||!Object.hasOwn(types,mime))throw Error("INVALID_MEDIA_PATH");
 return prefix+[sender,recipient,batch,item+"."+types[mime]].join("/");
}
async function signed(origin:string,secret:string,path:string){
 const expires=Math.floor(Date.now()/1000)+300;
 const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode("/"+path+expires)));
 const token="HS256-"+btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
 return origin+"/"+path+"?token="+encodeURIComponent(token)+"&expires="+expires;
}
async function bounded(req:Request,limit:number){
 const length=Number(req.headers.get("content-length")||0);
 if(length>limit)throw Error("FILE_TOO_LARGE");
 if(!req.body)throw Error("EMPTY_BODY");
 const reader=req.body.getReader(),parts:Uint8Array[]=[];let total=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>limit){await reader.cancel();throw Error("FILE_TOO_LARGE")}parts.push(value)}}finally{reader.releaseLock()}
 if(total===0)throw Error("EMPTY_BODY");const out=new Uint8Array(total);let off=0;for(const p of parts){out.set(p,off);off+=p.length}
 return out.buffer;
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin")||"";
 const headers={"Access-Control-Allow-Origin":allowed.has(origin)?origin:"https://blackcellcorp.com","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info,x-bc-batch,x-bc-filename,x-bc-order","Cache-Control":"no-store","Vary":"Origin","Content-Type":"application/json"};
 const send=(status:number,data:Record<string,unknown>)=>new Response(JSON.stringify(data),{status,headers});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST"||(origin&&!allowed.has(origin)))return send(403,{ok:false,code:"REQUEST_DENIED"});
 const token=req.headers.get("authorization")||"";
 if(!/^Bearer\s+\S+$/i.test(token))return send(401,{ok:false,code:"SIGN_IN_REQUIRED"});
 const host=Deno.env.get("SUPABASE_URL")||"",pub=Deno.env.get("SUPABASE_ANON_KEY")||"";
 const storageKey=(Deno.env.get("BLACKCELL_CHAT_BUNNY_STORAGE_ACCESS_KEY")||"").trim(),cdnKey=(Deno.env.get("BLACKCELL_CHAT_BUNNY_TOKEN_KEY")||"").trim(),cdn=(Deno.env.get("BLACKCELL_CHAT_BUNNY_CDN_URL")||"").trim();
 // Fail closed until the separate CDN zone has been validated by an administrator.
 if(Deno.env.get("BLACKCELL_CHAT_BUNNY_CUTOVER")!=="verified-v1"||!host||!pub||!storageKey||!cdnKey||cdn!=="https://blackcell-private-chat.b-cdn.net")
  return send(503,{ok:false,code:"PRIVATE_BUNNY_DELIVERY_NOT_CONFIGURED"});
 const jwt=token.replace(/^Bearer\s+/i,""),db=createClient(host,pub,{global:{headers:{Authorization:"Bearer "+jwt}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 try{
  const auth=await db.auth.getUser(jwt);const uid=auth.data.user?.id;
  if(auth.error||!uid)return send(401,{ok:false,code:"SIGN_IN_REQUIRED"});
  const action=new URL(req.url).searchParams.get("action");
  if(action==="links"){
   let payload;try{payload=JSON.parse(new TextDecoder().decode(await bounded(req,4096)))}catch{return send(400,{ok:false,code:"INVALID_REQUEST"})}
   const ids=Array.isArray(payload?.ids)?[...new Set<string>(payload.ids)]:[];
   if(!ids.length||ids.length>4||!ids.every(x=>typeof x==="string"&&uuid.test(x)))return send(400,{ok:false,code:"INVALID_IDS"});
   const {data,error}=await db.from("corp_chat_media_items").select("id,batch_id,sender_id,recipient_id,storage_path,mime_type").in("id",ids);
   if(error||!data)return send(403,{ok:false,code:"MEDIA_DENIED"});
   const links=[];
   for(const item of data){
    if(uid!==item.sender_id&&uid!==item.recipient_id)continue;
    const {data:batch,error:be}=await db.from("corp_chat_media_batches").select("id,sender_id,recipient_id").eq("id",item.batch_id).maybeSingle();
    if(be||!batch||batch.sender_id!==item.sender_id||batch.recipient_id!==item.recipient_id)continue;
    let path;try{path=keyFor(item.sender_id,item.recipient_id,item.batch_id,item.id,item.mime_type)}catch{continue}
    if(item.storage_path!==path)continue;
    links.push({id:item.id,signedUrl:await signed(cdn,cdnKey,path)});
   }
   return send(200,{ok:true,links});
  }
  if(action!=="upload")return send(400,{ok:false,code:"UNSUPPORTED_ACTION"});
  const batchId=req.headers.get("x-bc-batch")||"",mime=(req.headers.get("content-type")||"").toLowerCase();
  const order=Number(req.headers.get("x-bc-order")||"0");
  let filename;try{filename=decodeURIComponent(req.headers.get("x-bc-filename")||"").replace(/[\u0000-\u001f\u007f]/g,"").slice(0,180)}catch{return send(400,{ok:false,code:"INVALID_FILENAME"})}
  if(!uuid.test(batchId)||!Object.hasOwn(types,mime)||!filename||!Number.isInteger(order)||order<0||order>1000000)return send(400,{ok:false,code:"INVALID_MEDIA"});
  const {data:batch,error:be}=await db.from("corp_chat_media_batches").select("id,sender_id,recipient_id").eq("id",batchId).maybeSingle();
  if(be||!batch||batch.sender_id!==uid||uid===batch.recipient_id)return send(403,{ok:false,code:"BATCH_DENIED"});
  let bytes;try{bytes=await bounded(req,mime.startsWith("audio/")?10*1024*1024:max)}catch{return send(413,{ok:false,code:"INVALID_FILE_SIZE"})}
  const id=crypto.randomUUID(),path=keyFor(uid,batch.recipient_id,batch.id,id,mime),checksum=await hash(bytes);
  const put=await fetch(zone+path,{method:"PUT",headers:{AccessKey:storageKey,"Content-Type":mime,Checksum:checksum.toUpperCase()},body:bytes,redirect:"error",signal:AbortSignal.timeout(90000)});
  if(put.status!==201)return send(502,{ok:false,code:"BUNNY_UPLOAD_FAILED"});
  // Storage API checksum verification on PUT; never store the file bytes in Supabase Storage.
  const record={id,batch_id:batch.id,sender_id:uid,recipient_id:batch.recipient_id,kind:mime.startsWith("image/")?"photo":mime.startsWith("audio/")?"audio":"video",filename,mime_type:mime,bytes:bytes.byteLength,storage_path:path,item_order:order};
  const indexed=await db.from("corp_chat_media_items").insert(record);
  if(indexed.error){
   // Never delete after an ambiguous database error (the insert may have committed).
   return send(502,{ok:false,code:"MEDIA_INDEX_UNCONFIRMED"});
  }
  return send(200,{ok:true,record});
 }catch{return send(502,{ok:false,code:"PRIVATE_MEDIA_REQUEST_FAILED"})}
});
