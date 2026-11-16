import {createClient} from "npm:@supabase/supabase-js@2.119.0";
const zone="https://la.storage.bunnycdn.com/blackcell-media-vault/blackcell-worlds/v1/";
const origins=new Set(["https://blackcellcorp.com","https://www.blackcellcorp.com","https://pjs7zyw62m-del.github.io"]);
const types:Record<string,string>={"video/mp4":"mp4","video/webm":"webm","video/quicktime":"mov","video/x-m4v":"m4v"};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const enc=new TextEncoder(),dec=new TextDecoder(),ttl=15*60*1000,max=45*1024*1024;
const b64=(v:Uint8Array)=>btoa(String.fromCharCode(...v)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const unb64=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
const aad=enc.encode("blackcell-world-playback-v1");
async function ticketKey(secret:string){return crypto.subtle.importKey("raw",await crypto.subtle.digest("SHA-256",enc.encode(secret)),"AES-GCM",false,["encrypt","decrypt"])}
async function seal(key:CryptoKey,jwt:string,id:string){const iv=crypto.getRandomValues(new Uint8Array(12));const data=enc.encode(JSON.stringify({jwt,id,exp:Date.now()+ttl}));return b64(iv)+"."+b64(new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:aad},key,data)))}
async function unseal(key:CryptoKey,ticket:string){
 if(ticket.length>12000||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(ticket))throw Error("INVALID_TICKET");
 const [i,c]=ticket.split("."),iv=unb64(i);if(iv.length!==12)throw Error("INVALID_TICKET");
 const p=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:"AES-GCM",iv,additionalData:aad},key,unb64(c))));
 if(typeof p.jwt!=="string"||!uuid.test(p.id)||!Number.isFinite(p.exp)||p.exp<=Date.now()||p.exp>Date.now()+ttl)throw Error("TICKET_EXPIRED");return p as {jwt:string,id:string,exp:number};
}
export function parseRange(header:string|null,size:number){
 if(!header)return {start:0,end:size-1,partial:false};
 const m=/^bytes=(\d*)-(\d*)$/.exec(header);if(!m||(!m[1]&&!m[2]))return null;
 let start:number,end:number;
 if(!m[1]){const n=Number(m[2]);if(!Number.isSafeInteger(n)||n<=0)return null;start=Math.max(0,size-n);end=size-1}
 else{start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),size-1):size-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||end<start)return null}
 return {start,end,partial:true};
}
// The storage API can ignore Range. In that case skip bytes as they arrive
// and cancel the upstream as soon as the requested span is delivered.
export function sliceBody(body:ReadableStream<Uint8Array>,skip:number,count:number){
 const reader=body.getReader();let remaining=count;
 return new ReadableStream<Uint8Array>({
  async pull(controller){try{while(remaining>0){const {done,value}=await reader.read();if(done)throw Error("TRUNCATED_MEDIA");if(skip>=value.length){skip-=value.length;continue}const part=value.subarray(skip,Math.min(value.length,skip+remaining));skip=0;remaining-=part.length;controller.enqueue(part);if(remaining===0){controller.close();void reader.cancel().catch(()=>{})}return}}catch(e){controller.error(e);void reader.cancel().catch(()=>{})}},
  cancel(reason){return reader.cancel(reason)}
 });
}
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 const headers={"Access-Control-Allow-Origin":origins.has(origin)?origin:"https://blackcellcorp.com","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type,range,x-client-info","Access-Control-Expose-Headers":"Accept-Ranges,Content-Range,Content-Length","Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","Vary":"Origin","X-Content-Type-Options":"nosniff"};
 const send=(status:number,code:string)=>new Response(JSON.stringify({ok:false,code}),{status,headers:{...headers,"Content-Type":"application/json"}});
 if(origin&&!origins.has(origin))return send(403,"REQUEST_DENIED");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(!["GET","POST"].includes(req.method))return send(405,"REQUEST_DENIED");
 const host=Deno.env.get("SUPABASE_URL")||"",pub=Deno.env.get("SUPABASE_ANON_KEY")||"",storageKey=Deno.env.get("BLACKCELL_BUNNY_STORAGE_ACCESS_KEY")?.trim()||"",secret=Deno.env.get("BLACKCELL_WORLD_PLAYBACK_SECRET")||"";
 if(!host||!pub||!storageKey||secret.length<32)return send(503,"PLAYBACK_NOT_CONFIGURED");
 try{
  const key=await ticketKey(secret);let jwt:string,id:string;
  if(req.method==="POST"){
   jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");if(!jwt)return send(401,"SIGN_IN_REQUIRED");
   const raw=await req.text();if(raw.length>1024)return send(400,"INVALID_REQUEST");try{id=JSON.parse(raw).id}catch{return send(400,"INVALID_REQUEST")}
  }else{
   try{const p=await unseal(key,new URL(req.url).searchParams.get("ticket")||"");jwt=p.jwt;id=p.id}catch{return send(401,"PLAYBACK_TICKET_INVALID")}
  }
  if(typeof id!=="string"||!uuid.test(id))return send(400,"INVALID_ID");
  // All requests, including every seek, use the original user's RLS-scoped
  // client and the same corporate authorization checks as private World read.
  const db=createClient(host,pub,{global:{headers:{Authorization:"Bearer "+jwt}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const identity=await db.auth.getUser(jwt),uid=identity.data.user?.id;
  if(identity.error||!uid)return send(401,"SIGN_IN_REQUIRED");
  const member=await db.from("corp_access_members").select("role,clearance_level").eq("user_id",uid).eq("active",true).maybeSingle(),role=member.data?.role;
  if(member.error||!["owner","employee"].includes(role)||role==="owner"&&Number(member.data?.clearance_level)!==7)return send(403,"MEMBER_REQUIRED");
  const verify=await db.rpc(role==="owner"?"corp_code_status":"corp_employee_code_status");
  if(verify.error||verify.data?.verified!==true)return send(403,"VERIFY_CORPORATE_SESSION");
  const row=await db.from("corp_social_assets").select("id,owner_id,storage_path,mime_type,source_provider,purpose,review_status,adult_restricted,kind,bytes").eq("id",id).maybeSingle(),a=row.data;
  if(row.error||!a||a.kind!=="video"||a.purpose!=="library"||a.source_provider!=="world-bunny-v1"||a.review_status==="rejected"||!(a.owner_id===uid||(a.review_status==="approved"&&!a.adult_restricted)))return send(404,"MEDIA_UNAVAILABLE");
  if(!uuid.test(a.owner_id)||!Object.hasOwn(types,a.mime_type))return send(404,"MEDIA_UNAVAILABLE");
  const path=a.owner_id+"/"+id+"."+types[a.mime_type],size=Number(a.bytes);
  if(a.storage_path!==path||!Number.isSafeInteger(size)||size<=0||size>max)return send(404,"MEDIA_UNAVAILABLE");
  if(req.method==="POST")return new Response(JSON.stringify({ok:true,ticket:await seal(key,jwt,id)}),{headers:{...headers,"Content-Type":"application/json"}});
  const range=parseRange(req.headers.get("range"),size);
  if(!range)return new Response(null,{status:416,headers:{...headers,"Content-Range":"bytes */"+size,"Accept-Ranges":"bytes"}});
  const count=range.end-range.start+1,expected="bytes "+range.start+"-"+range.end+"/"+size;
  const upstream=await fetch(zone+path,{headers:{AccessKey:storageKey,...(range.partial?{Range:"bytes="+range.start+"-"+range.end}:{})},redirect:"error",signal:AbortSignal.timeout(90000)});
  if(!upstream.body||![200,206].includes(upstream.status)){await upstream.body?.cancel();return send(502,"STORAGE_READ_FAILED")}
  if(upstream.status===206&&(!range.partial||upstream.headers.get("content-range")!==expected)){await upstream.body.cancel();return send(502,"INVALID_STORAGE_RANGE")}
  const declared=upstream.headers.get("content-length");
  if(declared!==null&&Number(declared)!==(upstream.status===206?count:size)){await upstream.body.cancel();return send(502,"STORAGE_SIZE_MISMATCH")}
  return new Response(sliceBody(upstream.body,upstream.status===206?0:range.start,count),{status:range.partial?206:200,headers:{...headers,"Content-Type":a.mime_type,"Content-Disposition":"inline","Accept-Ranges":"bytes","Content-Length":String(count),...(range.partial?{"Content-Range":expected}:{})}});
 }catch{return send(502,"PLAYBACK_REQUEST_FAILED")}
});
