import {createClient} from "npm:@supabase/supabase-js@2.119.0";
const origins=new Set(["https://blackcellcorp.com","https://www.blackcellcorp.com","https://pjs7zyw62m-del.github.io"]);
const base="https://api-singapore.klingai.com",MAX=8*1024*1024,CHUNK=4*1024*1024,TABLE="blackcell_ai_video_retry";
const motions:Record<string,string>={gentle:"Subtle natural movement, preserve appearance, clothing and surroundings. Steady camera, realistic motion.",camera:"Gentle cinematic camera movement around the existing scene. Preserve identity, clothing, surroundings and proportions.",ambient:"Subtle natural movement in the existing environment. Preserve the original scene, clothing, identity and proportions."};
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
  if(Number(req.headers.get("content-length")||0)>4096)return send({ok:false,code:"INVALID_REQUEST"},400);
  const input=await req.json(),action=input.action,path=input.path;
  if(!["status","create","output"].includes(action)||!validPath(path,uid))return send({ok:false,code:"PILOT_REQUIRES_OWN_JPEG_OR_PNG"});
  const existing=await db.from(TABLE).select("id,user_id,source_path,state,provider_task_id,created_at,provider_http,provider_code").eq("singleton",true).maybeSingle();
  if(existing.error)return send({ok:false,code:"LEDGER_UNAVAILABLE"});
  const job=existing.data;
  const previous=await db.from("blackcell_ai_video_pilot").select("id,user_id,source_path,state,provider_task_id,created_at").eq("singleton",true).maybeSingle();
  if(previous.error||!previous.data||previous.data.user_id!==uid||previous.data.provider_task_id||previous.data.state!=="uncertain")return send({ok:false,code:"PRIOR_ATTEMPT_REVIEW_REQUIRED"});
  if(job&&(job.user_id!==uid||job.source_path!==path))return send({ok:false,code:"PILOT_ALREADY_USED"});
  async function priorCheck(){
   const old=previous.data!;
   const exact=await kling("/tasks?external_task_ids="+encodeURIComponent(old.id)),a=await exact.json().catch(()=>null);
   const history=await kling("/tasks",{method:"POST",body:JSON.stringify({start_time:String(new Date(old.created_at).getTime()-60000),end_time:String(Date.now()),cursor:"",limit:100,filters:[{key:"product_type",values:["video"]}]})}),h=await history.json().catch(()=>null);
   const exactRows=Array.isArray(a?.data)?a.data:Array.isArray(a?.data?.result)?a.data.result:null;
   const list=Array.isArray(h?.data?.result)?h.data.result:null;
   const diagnostic={exactHttp:exact.status,exactCode:Number.isInteger(a?.code)?a.code:null,exactCount:exactRows?.length??null,exactShape:Array.isArray(a?.data)?"array":Array.isArray(a?.data?.result)?"result":a?.data===null?"null":typeof a?.data,historyHttp:history.status,historyCode:Number.isInteger(h?.code)?h.code:null,historyCount:list?.length??null,more:h?.data?.has_more===false?false:h?.data?.has_more===true?true:null,matched:!!list?.some((t:Record<string,unknown>)=>t?.external_id===old.id||t?.external_task_id===old.id)};
   const ok=exact.ok&&a?.code===0&&exactRows?.length===0&&history.ok&&h?.code===0&&list!==null&&diagnostic.more===false&&!diagnostic.matched;
   console.info("KLING_RETRY_PREFLIGHT",JSON.stringify({...diagnostic,ok}));
   return {ok,diagnostic};
  }
  if(action==="status"&&!job){
   const check=await priorCheck();
   return check.ok?send({ok:true,state:"ready"}):send({ok:false,code:"PRIOR_ATTEMPT_REVIEW_REQUIRED",diagnostic:check.diagnostic});
  }
  if(action==="create"){
   if(job)return send({ok:true,state:job.state,id:job.id});
   if(input.approve!==true||input.rights!==true||!Object.hasOwn(motions,input.motion))return send({ok:false,code:"CONFIRMATION_REQUIRED"});
   if(input.retryConfirmed!==true)return send({ok:false,code:"CONFIRMATION_REQUIRED"});
   const preflight=await priorCheck();if(!preflight.ok)return send({ok:false,code:"PRIOR_ATTEMPT_REVIEW_REQUIRED",diagnostic:preflight.diagnostic});
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
   if(!acct.ok||usage?.code!==0||usage?.data?.code!==0||!Array.isArray(packs)||!packs.some(p=>p.status==="online"&&Number(p.remaining_quantity)>=3))return send({ok:false,code:"PACKAGE_NOT_READY"});
   // Atomic project-wide cap. A failed/ambiguous POST never triggers another paid submission.
   const reserved=await db.from(TABLE).insert({singleton:true,user_id:uid,source_path:path,state:"reserved"}).select("id").single();
   if(reserved.error||!reserved.data)return send({ok:false,code:"PILOT_ALREADY_USED"});
   const id=reserved.data.id;
   try{
    const res=await kling("/image-to-video/kling-3.0",{method:"POST",body:JSON.stringify({contents:[{type:"prompt",text:motions[input.motion]},{type:"first_frame",url:b64(photo)}],settings:{resolution:"720p",duration:5,audio:"off",multi_shot:false},options:{external_task_id:id,watermark_info:{enabled:true}}})}),data=await res.json().catch(()=>null);
    console.info("KLING_CREATE_RESULT",JSON.stringify({http:res.status,code:Number.isInteger(data?.code)?data.code:null,taskReceived:typeof data?.data?.id==="string"}));
    const accepted=res.ok&&data?.code===0&&typeof data?.data?.id==="string";
    const providerCode=Number.isInteger(data?.code)?data.code:null, definiteReject=res.status>=400&&res.status<500&&providerCode!==null&&providerCode!==0;
    const state=accepted&&states.has(data.data.status)?data.data.status:accepted?"submitted":definiteReject?"failed":"uncertain";
    await db.from(TABLE).update({state,provider_task_id:accepted?data.data.id:null,provider_http:res.status,provider_code:providerCode}).eq("id",id);
    return send({ok:accepted,state,id,code:accepted?"SUBMITTED":definiteReject?"PROVIDER_REJECTED":"SUBMISSION_UNCONFIRMED",diagnostic:{http:res.status,providerCode}});
   }catch{await db.from(TABLE).update({state:"uncertain"}).eq("id",id);return send({ok:false,state:"uncertain",id,code:"SUBMISSION_UNCONFIRMED"})}
  }
  if(!job)return send({ok:true,state:"ready"});
  if(job.state==="failed"&&!job.provider_task_id)return send({ok:true,state:"failed",id:job.id,code:"PROVIDER_REJECTED",diagnostic:{http:job.provider_http,providerCode:job.provider_code}});
  const query=job.provider_task_id?"task_ids="+encodeURIComponent(job.provider_task_id):"external_task_ids="+encodeURIComponent(job.id);
  const res=await kling("/tasks?"+query),data=await res.json().catch(()=>null);
  let task=res.ok&&data?.code===0&&Array.isArray(data.data)?data.data.find((t:Record<string,unknown>)=>job.provider_task_id?t.id===job.provider_task_id:t.external_id===job.id):null;
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
  if(Number(video.headers.get("content-length")||0)>45*1024*1024){await video.body.cancel();return send({ok:false,code:"OUTPUT_TOO_LARGE"})}
  return new Response(video.body,{headers:{...headers,"Content-Type":"application/octet-stream"}});
 }catch{return send({ok:false,code:"PILOT_REQUEST_FAILED"})}
});