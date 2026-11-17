/* BLACKCELL OS / private media auto-sort.
 * Runs only within an authenticated Upload Queue window and never publishes.
 * Existing approved corrections serve as few-shot memory in blackcell-military-ai.
 * Auto-processing has an account-local daily cap in addition to the server cap.
 */
import {corporateClient} from "./corp-auth.js?v=20261114-transport-classification";
const client=corporateClient(),$=id=>document.getElementById(id);
const WORLDS={
 military:"Military World",police:"Law Enforcement World",fire:"Fire & Rescue World",
 medical:"Emergency Medical World",security:"Corrections & Security World",
 professional:"Aviation & Professional Uniforms",unsorted:"Needs Classification"
};
const AUTO_LIMIT=20,DAILY_KEY="bc_auto_sort_count_v1_",CHOICE_KEY="bc_auto_sort_enabled_v1_";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let ownerId="",owner=false,enabled=false,paused=false,busy=false,loaded=false,refreshInFlight=false;
let pending=[],analyses=new Map(),activeTask=null,version=0,refreshTimer=0,failures=0;
const $status=()=>$("bcAutoSortStatus");
const BC_PARENT_STATE="BLACKCELL_AUTOPILOT_STATE_V1";
const BC_PARENT_COMMAND="BLACKCELL_AUTOPILOT_COMMAND_V1";
function informParent(){
 if(window.parent===window)return;
 try{
  window.parent.postMessage({type:BC_PARENT_STATE,
   owner:!!owner,ready:!!loaded,enabled:!!enabled,paused:!!paused,busy:!!busy,
   pending:pending.length,analyzed:pending.filter(a=>analyses.has(a.id)).length,
   unclassified:pending.filter(a=>!a.adult_restricted&&!analyses.has(a.id)).length,
   dailyUsed:ownerId?dailyCount():0,dailyMax:AUTO_LIMIT,
   status:$status()?.textContent?.slice(0,240)||""
  },location.origin);
 }catch(_){}
}
function setAutomation(on){
 if(!loaded||!owner||!ownerId){note("Automatic AI needs Level 7 owner access.");return}
 enabled=!!on;paused=!enabled;
 safeStore(CHOICE_KEY+ownerId,enabled?"1":"0");
 clearTimeout(refreshTimer);
 if(enabled){note("AutoPilot enabled. Sorting new eligible private photos while BLACKCELL is open.");schedule()}
 else note("AutoPilot paused. No more automatic analyses will start; your photos and suggestions remain private.");
 showState();
}
function onParentMessage(event){
 if(window.parent===window||event.source!==window.parent||event.origin!==location.origin)return;
 const command=event.data;
 if(!command||command.type!==BC_PARENT_COMMAND||!owner||!loaded)return;
 if(command.action==="status"){informParent();return}
 if(command.action==="enable"){setAutomation(true);return}
 if(command.action==="pause"){setAutomation(false);return}
 if(command.action==="refresh"){void refresh();return}
 if(command.action==="run"){void processSafely({manual:true})}
}
async function processSafely(options={}){
 if(!owner||!ownerId)return;
 if(options.manual&&!busy)paused=false;
 const task=()=>process(options);
 if(navigator.locks?.request){
  await navigator.locks.request("blackcell-ai-autopilot-"+ownerId,{ifAvailable:true,mode:"exclusive"},async lock=>{
   if(lock)await task();
   else note("AutoPilot is already analyzing photos in another BLACKCELL window.");
  });
 }else await task();
 informParent();
}
window.addEventListener("message",onParentMessage);
function safeStore(key,value){
 try{if(value===undefined)return localStorage.getItem(key);localStorage.setItem(key,value)}catch(_){return null}
 return value;
}
function dailyCount(){
 const key=DAILY_KEY+ownerId,raw=safeStore(key);
 try{const value=JSON.parse(raw||"null");return value?.day===new Date().toISOString().slice(0,10)?Math.max(0,Number(value.count)||0):0}catch{return 0}
}
function bumpCount(){safeStore(DAILY_KEY+ownerId,JSON.stringify({day:new Date().toISOString().slice(0,10),count:dailyCount()+1}))}
const note=(message,error=false)=>{const n=$status();if(n){n.textContent=message;n.dataset.error=String(error)}informParent()};
const text=(type,cls,content)=>{const n=document.createElement(type);if(cls)n.className=cls;if(content!==undefined)n.textContent=String(content);return n};
function worldFrom(a){
 const tag=Array.isArray(a.tags)?a.tags.find(t=>typeof t==="string"&&/^maf:(military|police|fire|medical|security|professional|unsorted)$/.test(t)):"";
 return tag?tag.slice(4):a.military_branch&&a.military_branch!=="Unspecified"?"military":"unsorted";
}
function route(a){
 if(!a)return "Pending AI Analysis";
 const world=worldFrom(a),parts=[WORLDS[world]||WORLDS.unsorted];
 if(a.confidence==="low"||world==="unsorted"||a.nudity_level!=="none")return "Needs Human Review";
 if(a.country_code&&/^[A-Z]{2}$/.test(a.country_code))parts.push(a.country_code);
 else parts.push("Country Unconfirmed");
 if(world==="military")parts.push(a.military_branch&&a.military_branch!=="Unspecified"?a.military_branch:"Branch Unconfirmed");
 parts.push(a.military_category&&a.military_category!=="Unsorted"?a.military_category:"Category Unconfirmed");
 return parts.join(" / ");
}
function showState(){
 informParent();
 const button=$("bcAutoSortRun"),toggle=$("bcAutoSortEnabled"),pause=$("bcAutoSortPause"),count=$("bcAutoSortCount");
 if(toggle)toggle.checked=enabled;
 if(button)button.disabled=busy||!ownerId;
 if(pause){pause.disabled=!busy;pause.textContent=paused?"Pausing…":"Pause AI";}
 if(count)count.textContent="AI searches today: "+dailyCount()+" / "+AUTO_LIMIT+" (automatic cap)";
 const list=$("bcAutoSortFolders");if(!list)return;
 list.replaceChildren();
 const folders=new Map();
 for(const a of pending){
  const analysis=analyses.get(a.id);
  const key=route(analysis);
  if(!folders.has(key))folders.set(key,[]);
  folders.get(key).push({asset:a,analysis});
 }
 if(!folders.size){list.append(text("p","bc-ai-empty","No eligible owned photographs need private AI sorting."));informParent();return}
 for(const [folder,items] of [...folders].sort((a,b)=>a[0].localeCompare(b[0]))){
  const details=text("details","bc-ai-folder");
  details.open=folder!=="Pending AI Analysis";
  const summary=text("summary","bc-ai-folder-label",folder);
  const badge=text("span","bc-ai-folder-count",items.length+" photo"+(items.length===1?"":"s"));summary.append(badge);
  details.append(summary);
  const contents=text("div","bc-ai-folder-content");
  for(const {asset,analysis} of items){
   const row=text("div","bc-ai-item");
   const label=text("span","bc-ai-item-name",asset.filename||"Private photograph");
   label.title=asset.filename||"";
   const desc=analysis?[
    analysis.uniform_type||"",analysis.camouflage_pattern||"",
    analysis.confidence?"Confidence: "+analysis.confidence:"",
    analysis.status==="approved"?"Correction learned":"Suggested — verify before publishing"
   ].filter(Boolean).join(" • "):"Awaiting visual analysis";
   const meta=text("span","bc-ai-item-meta",desc);
   const data=text("div","bc-ai-item-content");data.append(label,meta);
   row.append(data);
   const btn=text("button","bc-ai-manual",analysis?"Review":"Sort");
   btn.type="button";btn.title="Open private Media Administration for owner review";
   btn.onclick=()=>{const target=document.getElementById("review");if(target&&!target.hidden)target.click();else note("Only the Level 7 administrator can approve the final destination.")};
   row.append(btn);contents.append(row);
  }
  details.append(contents);list.append(details);
 }
 informParent();
}
async function refresh(){
 if(!ownerId||refreshInFlight)return;
 refreshInFlight=true;
 try{
  const {data,error}=await client.from("corp_social_assets")
   .select("id,filename,kind,mime_type,bytes,adult_restricted,source_provider,created_at,review_status")
   .eq("owner_id",ownerId).eq("purpose","library").eq("source_provider","world-bunny-v1")
   .eq("kind","photo").in("review_status",["pending","approved"])
   .order("created_at",{ascending:true}).limit(120);
  if(error)throw error;
  pending=data||[];
  const ids=pending.map(a=>a.id);
  analyses=new Map();
  if(ids.length){
   const res=await client.from("corp_social_ai_analysis")
     .select("asset_id,status,country_code,military_branch,military_category,uniform_type,camouflage_pattern,confidence,nudity_level,notes,tags,updated_at")
     .eq("owner_id",ownerId).in("asset_id",ids);
   if(res.error)throw res.error;
   analyses=new Map((res.data||[]).map(a=>[a.asset_id,a]));
  }
  showState();
 }catch(e){note("Could not update private AI folders: "+String(e.message||e).slice(0,150),true)}
 finally{refreshInFlight=false;informParent()}
}
function previewFromFile(file){
 return new Promise((resolve,reject)=>{
  if(!file||!file.type.startsWith("image/"))return reject(Error("Not a photo"));
  const local=URL.createObjectURL(file),image=new Image();
  image.onload=()=>{
   try{
    const canvas=document.createElement("canvas"),scale=Math.min(1,1400/Math.max(image.naturalWidth,image.naturalHeight));
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const ctx=canvas.getContext("2d",{alpha:false});if(!ctx)throw Error("Canvas unavailable");
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    let result="";
    for(const quality of [.78,.66,.5]){
     result=canvas.toDataURL("image/jpeg",quality);
     if(result.length<3750000)break;
    }
    canvas.width=canvas.height=1;
    URL.revokeObjectURL(local);
    if(result.length>=3750000)throw Error("Image preview exceeds AI service limit");
    resolve(result);
   }catch(e){URL.revokeObjectURL(local);reject(e)}
  };
  image.onerror=()=>{URL.revokeObjectURL(local);reject(Error("This device cannot decode the photo. Manual classification remains available."))};
  image.src=local;
 });
}
async function protectedPreview(asset){
 const session=(await client.auth.getSession()).data.session,config=window.BLACKCELL_CORP_CONFIG||{};
 if(!session?.access_token||!config.url||!config.publishableKey)throw Error("Sign in again to read private media");
 const response=await fetch(new URL("/functions/v1/blackcell-world-media?action=read",config.url),{
  method:"POST",headers:{authorization:"Bearer "+session.access_token,apikey:config.publishableKey,"Content-Type":"application/json"},
  body:JSON.stringify({id:asset.id})});
 if(!response.ok)throw Error("Private photo read failed ("+response.status+")");
 const blob=await response.blob();if(!blob.type.startsWith("image/")||blob.size>45*1048576)throw Error("Unsupported photo preview");
 return previewFromFile(blob);
}
async function classify(asset,localFile=null){
 if(analyses.has(asset.id)||!UUID.test(asset.id)||asset.adult_restricted)return false;
 // The AI endpoint validates image ownership again. All responses are private
 // "suggested" records; it never publishes an image or creates a public album.
 const request={action:"analyze",asset_id:asset.id};
 if(localFile||Number(asset.bytes)>10*1048576||!["image/jpeg","image/png","image/webp","image/gif"].includes(asset.mime_type)){
  request.preview_image=localFile?await previewFromFile(localFile):await protectedPreview(asset);
 }
 const {data,error}=await client.functions.invoke("blackcell-military-ai",{body:request});
 if(error){
  let detail=error.message||"AI unavailable";
  try{const d=await error.context?.json?.();detail=d?.error||d?.code||detail}catch{}
  throw Error(String(detail).slice(0,220));
 }
 if(!data?.ok||!data.analysis)throw Error(String(data?.error||"No AI classification returned"));
 analyses.set(asset.id,data.analysis);return true;
}
async function process(options={}){
 if(busy||!owner||!ownerId)return;
 busy=true;failures=0;showState();
 const limit=options.manual?Math.max(0,AUTO_LIMIT-dailyCount()):Math.max(0,AUTO_LIMIT-dailyCount());
 if(!limit){busy=false;paused=!enabled;note("The automatic AI budget (20 analyses today) has been reached. Your photos remain private for manual review.");showState();return}
 await refresh();
 const work=pending.filter(a=>!a.adult_restricted&&!analyses.has(a.id)).slice(0,limit);
 if(!work.length){busy=false;paused=!enabled;note("All eligible photos have AI suggestions, or no photos remain.");showState();return}
 let completed=0;let skipped=0;
 for(const asset of work){
  if(paused||!ownerId)break;
  try{
   note("Reading uniform details and sorting: "+(asset.filename||"photo")+" ("+(completed+1)+" of "+work.length+")");
   // Charge the local budget before making a potentially billable provider call,
   // even if the upstream request fails. Backend also has its own cap.
   bumpCount();showState();
   const file=activeTask?.id===asset.id?activeTask.file:null;
   const done=await classify(asset,file);
   if(done)completed++;else skipped++;
  }catch(e){
   failures++;
   note("AI couldn't classify "+(asset.filename||"photo")+": "+String(e.message||e).slice(0,160),true);
   // Stop instead of hammering an unavailable/paid service.
   if(failures>=2)break;
  }
  await refresh();
 }
 busy=false;paused=!enabled;activeTask=null;showState();
 if(!failures)note(completed+" photograph(s) classified privately. Uncertain patterns remain unverified; publication approval is separate.");
 else note(completed+" sorted; "+failures+" AI request(s) failed. No original files or publishing status changed.",true);
}
function schedule(){
 if(!owner||!enabled||paused||busy||!loaded||!ownerId)return;
 clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>void processSafely(),1500);
}
async function saved(ev){
 const id=String(ev.detail?.id||"");
 if(!UUID.test(id)||!ownerId)return;
 activeTask={id,file:ev.detail?.file||null};
 await refresh();schedule();
}
async function ready(ev){
 const id=String(ev.detail?.userId||"");
 if(!UUID.test(id))return;
 ownerId=id;owner=!!ev.detail?.isOwner;
 const stored=safeStore(CHOICE_KEY+id);
 enabled=stored===null?owner:stored==="1";paused=!enabled;
 loaded=true;showState();await refresh();
 note(enabled?"Automatic private AI sorting enabled. Photos will be grouped using their visible uniform details.":"Auto-sort is off. Enable it to send private photo previews for AI suggestions.");
 if(enabled)schedule();
}
function init(){
 const toggle=$("bcAutoSortEnabled");
 if(!toggle)return;
 toggle.addEventListener("change",()=>setAutomation(toggle.checked));
 $("bcAutoSortRun").onclick=()=>void processSafely({manual:true});
 $("bcAutoSortPause").onclick=()=>setAutomation(false);
 $("bcAutoSortRefresh").onclick=()=>void refresh();
 window.addEventListener("blackcell:upload-queue-ready",ready);
 if(window.BLACKCELL_UPLOAD_QUEUE_CONTEXT)void ready({detail:window.BLACKCELL_UPLOAD_QUEUE_CONTEXT});
 window.addEventListener("blackcell:upload-saved",ev=>void saved(ev));
 window.addEventListener("pagehide",()=>{paused=true;clearTimeout(refreshTimer)});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
