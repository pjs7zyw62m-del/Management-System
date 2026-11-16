import {createClient} from "npm:@supabase/supabase-js@2.119.0";
const origins=new Set(["https://blackcellcorp.com","https://www.blackcellcorp.com","https://pjs7zyw62m-del.github.io"]);
const base="https://api-singapore.klingai.com",MAX=8*1024*1024,CHUNK=4*1024*1024,TABLE="blackcell_ai_video_jobs";
const motions:Record<string,string>={still:"Locked-off camera; gentle realistic breathing and natural motion without changing clothing or identity.",push:"Slow smooth camera push-in, retain original composition and realistic details.",pull:"Slow camera pull-back with natural movement and a stable background.",pan:"Slow horizontal camera pan, preserving the original subject and setting.",orbit:"Gentle cinematic orbit around the subject, stable anatomy and appearance.",gentle:"Subtle natural movement, preserve appearance, clothing and surroundings. Steady camera, realistic motion.",camera:"Gentle cinematic camera movement around the existing scene. Preserve identity, clothing, surroundings and proportions.",ambient:"Subtle natural movement in the existing environment. Preserve the original scene, clothing, identity and proportions."};
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const states=new Set(["submitted","processing","succeeded","failed"]);
const validPath=(p:unknown,uid:string):p is string=>typeof p==="string"&&p.length<330&&!/[\x00-\x1f\x7f\\]/.test(p)&&( /^Photos\/[^/]+\.(?:jpe?g|png)$/i.test(p)&&!/^Photos\/BLACKCELL-[0-9a-f-]{36}\./i.test(p)||p.startsWith("Photos/From Members/"+uid+"/")&&/^BLACKCELL-[0-9a-f-]{36}\.(?:jpe?g|png)$/i.test(p.split("/").at(-1)||"")&&p.split("/").length===4);
async function bytes(res:Response,max:number){
 if(!res.ok||!res.body)throw Error("MEDIA_UNAVAILABLE");
 const reader=res.body.getReader(),parts:Uint8Array[]=[];let total=0;try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>max){await reader.cancel();throw Error("MEDIA_TOO_LARGE")}parts.push(value)}}finally{reader.releaseLock()}
 const out=new Uint8Array(total);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length}return out;
}
const b64=(v:Uint8Array)=>{let s="";for(let i=0;i<v.length;i+=16384)s+=String.fromCharCode(...v.subarray(i,i+16384));return btoa(s)};
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"",headers={"Access-Control-Allow-Origin":origins.has(origin)?origin:"https://blackcellcorp.com","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Cache-Control":"private, no-store","Vary":"Origin","X-Content-Type-Options":"nosniff"};
 const send=(body:Record<string,unknown>,status=200)=>{if(body.ok===false)console.info("KLING_PILOT_BLOCK",JSON.stringify({code:body.code,status,diagnostic:body.diagnostic||null}));return new Response(JSON.stringify(body),{status,headers:{...headers,"Content-Type":"application/json"}})};
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST"||(origin&&!origins.has(origin)))return send({ok:false,code:"DENIED"},403);
 const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 const host=Deno.env.get("SUPABASE_URL")||"",pub=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",key=Deno.env.get("BLACKCELL_KLING_API_KEY")?.trim();
 if(!jwt||!host||!pub||!service||!key)return send({ok:false,code:"NOT_CONFIGURED"},401);
 const opt={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
 const caller=createClient(host,pub,{...opt,global:{headers:{Authorization:"Bearer "+jwt}}}),db=createClient(host,service,opt);
 const kling=(path:string,init:RequestInit={})=>fetch(base+path,{...init,headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},redirect:"error",signal:AbortSignal.timeout(18000)});
 try{
  const identity=await caller.auth.getUser(jwt),uid=identity.data.user?.id;
  if(identity.error||!uid)return send({ok:false,code:"SIGN_IN_REQUIRED"},401);
  const m=await caller.from("corp_access_members").select("role,clearance_level").eq("user_id",uid).eq("active",true).maybeSingle(),verify=await caller.rpc("corp_code_status");
  if(m.error||m.data?.role!=="owner"||Number(m.data.clearance_level)!==7||verify.error||verify.data?.verified!==true)return send({ok:false,code:"OWNER_ONLY"},403);
  if(Number(req.headers.get("content-length")||0)>8192)return send({ok:false,code:"INVALID_REQUEST"},400);
  const input=JSON.parse(new TextDecoder().decode(await bytes(new Response(req.body),8192))),action=input.action,path=input.path;
  if(!["list","status","create","output"].includes(action)||!validPath(path,uid))return send({ok:false,code:"PILOT_REQUIRES_OWN_JPEG_OR_PNG"});
  const fields="id,user_id,source_path,state,provider_task_id,created_at,provider_http,provider_code,model,resolution,duration,estimated_units";
  const summary=(j:any)=>({id:j.id,state:j.state,model:j.model,resolution:j.resolution,duration:j.duration,estimatedUnits:Number(j.estimated_units),createdAt:j.created_at});
  const activeQuery=()=>db.from(TABLE).select(fields).eq("user_id",uid).in("state",["reserved","submitted","processing","uncertain"]).maybeSingle();
  if(action==="list"){
   const [history,active]=await Promise.all([db.from(TABLE).select(fields).eq("user_id",uid).eq("source_path",path).order("created_at",{ascending:false}).limit(50),activeQuery()]);
   if(history.error||active.error)return send({ok:false,code:"LEDGER_UNAVAILABLE"});
   return send({ok:true,jobs:(history.data||[]).map(summary),active:active.data?{...summary(active.data),path:active.data.source_path}:null});
  }
  if(!uuid.test(String(input.id||"")))return send({ok:false,code:"INVALID_JOB_ID"});
  const existing=await db.from(TABLE).select(fields).eq("id",input.id).eq("user_id",uid).eq("source_path",path).maybeSingle();
  if(existing.error)return send({ok:false,code:"LEDGER_UNAVAILABLE"});
  const job=existing.data;
  if(action==="create"){
   if(job)return send({ok:true,state:job.state,id:job.id});
   const model=input.model,resolution=input.resolution,duration=input.duration;
   if(input.approve!==true||input.rights!==true)return send({ok:false,code:"CONFIRMATION_REQUIRED"});
   const flash=model==="kling-4.0-flash",full=model==="kling-4.0";
   if(!Number.isInteger(duration)||duration<3||(!flash&&!full)||flash&&(resolution!=="720p"||duration>20)||full&&(!["720p","1080p"].includes(resolution)||duration>30))return send({ok:false,code:"INVALID_SETTINGS"});
   const cost=Math.round(duration*(flash?0.6:resolution==="1080p"?1.5:1)*10)/10;
   if(input.estimatedUnits!==cost)return send({ok:false,code:"PRICE_CONFIRMATION_REQUIRED"});
   const prompt=typeof input.prompt==="string"?input.prompt.trim():"";
   if(prompt.length>1000||(!prompt&&!Object.hasOwn(motions,input.motion)))return send({ok:false,code:"INVALID_PROMPT"});
   const text=prompt?"Create a realistic, nonsexual video from the authorized original photograph. Preserve identity, clothing and dignity. "+prompt:motions[input.motion];
   const active=await activeQuery();if(active.error)return send({ok:false,code:"LEDGER_UNAVAILABLE"});if(active.data)return send({ok:false,code:"ACTIVE_JOB_EXISTS"});
   // Authoritative read via the signed-in owner's encrypted storage gateway. No caller-supplied image bytes or URL.
   const drive=(act:string,body:Record<string,unknown>)=>fetch(host+"/functions/v1/blackcell-os-private-drive?action="+act,{method:"POST",headers:{Authorization:"Bearer "+jwt,apikey:pub,"Content-Type":"application/json"},body:JSON.stringify(body),redirect:"error",signal:AbortSignal.timeout(25000)});
   const lookup=await drive("lookup",{path}),catalog=await lookup.json().catch(()=>null);
   if(!lookup.ok||catalog?.ok!==true)return send({ok:false,code:"SOURCE_UNAVAILABLE"});
   let photo:Uint8Array;
   if(catalog.row){
    const size=Number(catalog.row.size_bytes);if(catalog.row.state!=="ready"||!Number.isSafeInteger(size)||size<=0||size>MAX)return send({ok:false,code:"SOURCE_SIZE_LIMIT"});
    photo=new Uint8Array(size);
    for(let i=0;i<Math.ceil(size/CHUNK);i++){const part=await bytes(await drive("read",{id:catalog.row.id,index:i}),CHUNK);if(part.length!==Math.min(CHUNK,size-i*CHUNK))return send({ok:false,code:"SOURCE_INCOMPLETE"});photo.set(part,i*CHUNK)}
   }else{
    const encoded=[uid,...path.split("/")].map(encodeURIComponent).join("/");
    photo=await bytes(await fetch(host+"/storage/v1/object/authenticated/blackcell-os-files/"+encoded,{headers:{Authorization:"Bearer "+jwt,apikey:pub},redirect:"error",signal:AbortSignal.timeout(25000)}),MAX);
   }
   if(!(photo[0]===255&&photo[1]===216&&photo[2]===255||photo[0]===137&&photo[1]===80&&photo[2]===78&&photo[3]===71))return send({ok:false,code:"SOURCE_FORMAT_UNSUPPORTED"});
   const end=Date.now(),acct=await kling("/account/costs?start_time="+(end-30*86400000)+"&end_time="+end),usage=await acct.json().catch(()=>null);
   const packs=usage?.data?.resource_pack_subscribe_infos;
   if(!acct.ok||usage?.code!==0||usage?.data?.code!==0||!Array.isArray(packs)||!packs.some(p=>p.status==="online"&&Number(p.remaining_quantity)>=cost&&(/flagship|4[.]0/i.test(String(p.resource_pack_name||""))||[64,637].includes(Number(p.total_quantity)))))return send({ok:false,code:"PACKAGE_NOT_READY"});
   // Provider balances can lag; conservatively account for recent locally reserved costs.
   const available=Math.max(0,...packs.filter(p=>p.status==="online"&&(/flagship|4[.]0/i.test(String(p.resource_pack_name||""))||[64,637].includes(Number(p.total_quantity)))).map(p=>Number(p.remaining_quantity)||0));
   const recent=await db.from(TABLE).select("estimated_units,state,provider_task_id").eq("user_id",uid).gte("created_at",new Date(Date.now()-12*3600000).toISOString()).limit(1000);
   if(recent.error)return send({ok:false,code:"LEDGER_UNAVAILABLE"});
   const reservedCost=(recent.data||[]).filter(j=>j.state!=="failed"||j.provider_task_id).reduce((sum,j)=>sum+Number(j.estimated_units),0);
   if(available-reservedCost+0.0001<cost)return send({ok:false,code:"RECENT_CREDIT_LIMIT"});
   const reserved=await db.from(TABLE).insert({id:input.id,user_id:uid,source_path:path,model,resolution,duration,estimated_units:cost,state:"reserved"}).select("id").single();
   if(reserved.error||!reserved.data)return send({ok:false,code:"ACTIVE_JOB_EXISTS"});
   const id=reserved.data.id;
   try{
    const res=await kling("/image-to-video/"+model,{method:"POST",body:JSON.stringify({contents:[{type:"prompt",text},{type:"first_frame",url:b64(photo)}],settings:{resolution,duration},options:{external_task_id:id,watermark_info:{enabled:true}}})}),data=await res.json().catch(()=>null);
    console.info("KLING_CREATE_RESULT",JSON.stringify({http:res.status,code:Number.isInteger(data?.code)?data.code:null,taskReceived:typeof data?.data?.id==="string"}));
    const accepted=res.ok&&data?.code===0&&typeof data?.data?.id==="string";
    const providerCode=Number.isInteger(data?.code)?data.code:null, definiteReject=res.status>=400&&res.status<500&&providerCode!==null&&providerCode!==0;
    const state=accepted&&states.has(data.data.status)?data.data.status:accepted?"submitted":definiteReject?"failed":"uncertain";
    await db.from(TABLE).update({state,provider_task_id:accepted?data.data.id:null,provider_http:res.status,provider_code:providerCode}).eq("id",id);
    return send({ok:accepted,state,id,code:accepted?"SUBMITTED":definiteReject?"PROVIDER_REJECTED":"SUBMISSION_UNCONFIRMED",diagnostic:{http:res.status,providerCode}});
   }catch{await db.from(TABLE).update({state:"uncertain"}).eq("id",id);return send({ok:false,state:"uncertain",id,code:"SUBMISSION_UNCONFIRMED"})}
  }
  if(!job)return send({ok:false,code:"JOB_NOT_FOUND"});
  if(job.state==="failed"&&!job.provider_task_id)return send({ok:true,state:"failed",id:job.id,code:"PROVIDER_REJECTED",diagnostic:{http:job.provider_http,providerCode:job.provider_code}});
  const query=job.provider_task_id?"task_ids="+encodeURIComponent(job.provider_task_id):"external_task_ids="+encodeURIComponent(job.id);
  const res=await kling("/tasks?"+query),data=await res.json().catch(()=>null);
  let task=res.ok&&data?.code===0&&Array.isArray(data.data)?data.data.find((t:Record<string,unknown>)=>job.provider_task_id?t.id===job.provider_task_id:(t.external_id===job.id||t.external_task_id===job.id)):null;
  const diag={http:res.status,code:Number.isInteger(data?.code)?data.code:null,matches:task?1:0};
  // Read-only reconciliation by recent task list, never a second generation.
  if(!task&&!job.provider_task_id&&["reserved","uncertain"].includes(job.state)){
   const listed=await kling("/tasks",{method:"POST",body:JSON.stringify({start_time:String(new Date(job.created_at).getTime()-60000),end_time:String(Date.now()),cursor:"",limit:100,filters:[{key:"product_type",values:["video"]}]})});
   const details=await listed.json().catch(()=>null),list=details?.data?.result;
   if(listed.ok&&details?.code===0&&Array.isArray(list))task=list.find((t:Record<string,unknown>)=>t.external_id===job.id);
   console.info("KLING_RECONCILE_RESULT",JSON.stringify({...diag,listHttp:listed.status,listCode:Number.isInteger(details?.code)?details.code:null,matched:!!task,more:details?.data?.has_more===true}));
   if(!task)return send({ok:true,state:job.state,id:job.id,code:"QUERY_UNCONFIRMED",diagnostic:{http:diag.http,providerCode:diag.code,listHttp:listed.status,listCode:Number.isInteger(details?.code)?details.code:null,matched:false}});
  }
  if(!task){console.info("KLING_QUERY_RESULT",JSON.stringify(diag));return send({ok:true,state:job.state,id:job.id,code:"QUERY_UNCONFIRMED",diagnostic:{http:diag.http,providerCode:diag.code,matched:false}})}
  const state=states.has(task.status)?task.status:job.state;
  if(task.external_id&&task.external_id!==job.id||job.provider_task_id&&task.id!==job.provider_task_id)return send({ok:false,code:"TASK_MISMATCH"});
  await db.from(TABLE).update({state,provider_task_id:typeof task.id==="string"?task.id:job.provider_task_id}).eq("id",job.id);
  const output=state==="succeeded"&&Array.isArray(task.outputs)?task.outputs.find(x=>x.type==="video"):null;
  const dest="Photos/From Members/"+uid+"/AI Creations/AI-"+job.id+".mp4";
  if(action==="status")return send({ok:true,state,id:job.id,outputReady:!!output,destination:dest});
  if(!output)return send({ok:false,code:"OUTPUT_NOT_READY"});
  const link=new URL(output.watermark_url||output.url);
  if(link.protocol!=="https:"||link.username||link.password||link.port||!link.hostname.endsWith(".klingai.com"))return send({ok:false,code:"OUTPUT_HOST_UNVERIFIED"});
  const video=await fetch(link,{redirect:"error",signal:AbortSignal.timeout(60000)});
  if(!video.ok||!video.body||!["video/mp4","application/octet-stream"].includes((video.headers.get("content-type")||"").split(";")[0]))return send({ok:false,code:"OUTPUT_UNAVAILABLE"});
  if(Number(video.headers.get("content-length")||0)>96*1024*1024){await video.body.cancel();return send({ok:false,code:"OUTPUT_TOO_LARGE"})}
  let count=0;const bounded=video.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){count+=chunk.byteLength;if(count>96*1024*1024){controller.error(Error("OUTPUT_TOO_LARGE"));return}controller.enqueue(chunk)}}));
  return new Response(bounded,{headers:{...headers,"Content-Type":"application/octet-stream"}});
 }catch{return send({ok:false,code:"PILOT_REQUEST_FAILED"})}
});