/* BLACKCELL Uniform Intelligence Center | owner-only catalog and learning */
import {corporateClient,corporateAuthorize} from "./corp-auth.js?v=20261114-transport-classification";
import {PATTERNS,SOURCES as CAMO_SOURCES,EXTERNAL_SAMPLES,COUNTRY_COMPARISON_LESSONS} from "./blackcell-camouflage-atlas.js?v=20261117-r3";
import {initGunnerCommand} from "./blackcell-gunner-command.js?v=20261117-journal-r1";
import {mountBlackcellVisualMemory} from "./blackcell-visual-memory.js?v=20261117-visual-memory-r1";
import {mountBlackcellUniformSemantic} from "./blackcell-uniform-semantic.js?v=20261117-semantic-memory-r1";
const db=corporateClient();
const $=id=>document.getElementById(id), E=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n;};
const W={military:"Military",police:"Law Enforcement",fire:"Fire & Rescue",medical:"Medical",security:"Corrections / Security",professional:"Aviation / Professional",unsorted:"Unsorted"};
const SOURCES=[
 ["asset","corp_social_assets","created_at","id,owner_id,kind,purpose,filename,created_at,caption,military_category,military_branch,military_country_code,military_era,military_tags,review_status,adult_restricted,source_provider,storage_path,bytes"],
 ["stream_video","corp_stream_videos","created_at","id,owner_id,title,filename,created_at,review_status,video_category,video_synopsis,adult_restricted,bytes"],
 ["post","corp_social_posts","created_at","id,author_id,body,kind,created_at"],
 ["saved","corp_social_tiktok_saves","saved_at","id,user_id,title,military_branch,creator_handle,saved_at"]
];
const data={user:null,owner:false,items:[],learning:[],ai:[],page:"catalog",selected:null,frame:0,blob:"",previewGeneration:0,loading:false,saving:false,videoFrame:null,videoSuggestions:new Map(),videoBusy:false,streamPlayback:null,memoryLoaded:false,autopilot:null,videoUsageToday:null,timelineFrames:new Map()};
let gunnerCommand=null,publicationReview=null,publicationReviewLoading=false,visualMemory=null,uniformSemantic=null;
const index=SOURCES.map(([type,table,order,fields])=>({type,table,order,fields,skip:0,done:false,error:""}));
const COUNTRY=typeof Intl.DisplayNames==="function"?new Intl.DisplayNames(["en"],{type:"region"}):null;
const country=c=>{if(!c)return"Unconfirmed";try{return(COUNTRY?.of(c)||c)+" ("+c+")"}catch{return c}};
const text=(id,value)=>{const n=$(id);if(n)n.textContent=String(value)};
const fmtTime=s=>{const n=Math.max(0,Number(s)||0),z=x=>String(x).padStart(2,"0");return n>=3600?z(Math.floor(n/3600))+":"+z(Math.floor(n/60)%60)+":"+z(n%60):z(Math.floor(n/60))+":"+z(n%60)};
function secs(s){const m=String(s||"").trim();if(!/^\d{1,2}:\d{2}(:\d{2})?$/.test(m))throw Error("Enter a time as MM:SS or HH:MM:SS");const v=m.split(":").map(Number);if(v.at(-1)>59||(v.length===3&&v[1]>59))throw Error("Invalid video time");const n=v.reduce((a,b)=>a*60+b,0);if(n>864000)throw Error("Time is outside supported range");return n}
function worldTags(tags){const x=(tags||[]).find(t=>typeof t==="string"&&/^maf:(military|police|fire|medical|security|professional|unsorted)$/.test(t));return x?x.slice(4):""}
function wrap(type,r){
 if(type==="asset")return{key:type+":"+r.id,type,id:r.id,title:r.filename||"Media",kind:r.kind,
  owner:r.owner_id,source:r.source_provider==="world-bunny-v1"?"worlds":r.purpose==="post"?"network":"library",
  provider:r.source_provider,path:r.storage_path,date:r.created_at,status:r.review_status||"unknown",adult:!!r.adult_restricted,
  desc:r.caption||"",world:worldTags(r.military_tags)||(r.military_branch&&r.military_branch!=="Unspecified"?"military":"unsorted"),
  country:r.military_country_code||"",branch:r.military_branch||"Unspecified",category:r.military_category||"Unsorted",
  era:r.military_era||"",tags:r.military_tags||[],size:Number(r.bytes)||0};
 if(type==="stream_video")return{key:type+":"+r.id,type,id:r.id,title:r.title||r.filename||"Tube video",kind:"video",owner:r.owner_id,source:"tube",date:r.created_at,status:r.review_status||"unknown",adult:!!r.adult_restricted,desc:r.video_synopsis||"",world:"unsorted",country:"",branch:"Unspecified",category:r.video_category||"Unsorted",era:"",tags:[],size:Number(r.bytes)||0};
 if(type==="post")return{key:type+":"+r.id,type,id:r.id,title:(r.body||"Social post").slice(0,95),kind:"post",owner:r.author_id,source:"social",date:r.created_at,status:"social",adult:false,desc:r.body||"",world:"unsorted",country:"",branch:"Unspecified",category:"Text",era:"",tags:[],size:0};
 return{key:type+":"+r.id,type,id:r.id,title:r.title||"Saved clip",kind:"video",owner:r.user_id,source:"saved",date:r.saved_at,status:"saved",adult:false,desc:r.creator_handle||"",world:"unsorted",country:"",branch:r.military_branch||"Unspecified",category:"External link",era:"",tags:[],size:0};
}
const ref=(item,frame=0)=>item?data.learning.find(x=>x.source_kind===item.type&&x.source_id===item.id&&x.frame_seconds===frame):null;
const ai=item=>item?.type==="asset"?data.ai.find(x=>x.asset_id===item.id):null;
function labels(item){const r=ref(item),a=ai(item);return{world:r?.world||worldTags(a?.tags)||item.world,
 country:r?.country_code||a?.country_code||item.country,branch:r?.branch||a?.military_branch||item.branch,
 category:r?.category||a?.military_category||item.category,uniform:r?.uniform_name||a?.uniform_type||"",
 memory:r?.reference_status||a?.status||"none",confidence:a?.confidence||"unverified"}}
const canTeach=x=>data.owner&&x&&(x.type==="asset"||x.type==="stream_video")&&(x.kind==="photo"||x.kind==="video")&&x.status!=="rejected";
// Stage tabs are read-only views of persisted classification and review status, not media copies.
const pipelineMedia=item=>!!item&&["asset","stream_video"].includes(item.type)&&["photo","video"].includes(item.kind);
function flowStage(item){
 if(!pipelineMedia(item))return "outside";
 if(["approved","rejected"].includes(item.status))return "completed";
 // Restricted content bypasses external AI and remains in owner-only manual review.
 if(item.adult)return "review";
 const classification=classificationStage(item);
 if(classification==="verified")return "review";
 if(classification==="ai_suggested"||classification==="needs_verification")return "teach";
 return "catalog";
}

const BC_AUTOPILOT_STATE="BLACKCELL_AUTOPILOT_STATE_V1";
const BC_AUTOPILOT_COMMAND="BLACKCELL_AUTOPILOT_COMMAND_V1";
function postAutopilotCommand(action){
 const frame=$("bcUploadFrame");
 if(!data.owner||!frame?.contentWindow)return;
 frame.contentWindow.postMessage({type:BC_AUTOPILOT_COMMAND,action},location.origin);
}
function updateAutopilot(){
 const x=data.autopilot,on=!!x?.enabled;
 $("bcAutopilotState").textContent=!x?.ready?"CONNECTING":x.busy?"ANALYZING":on?"ACTIVE":"PAUSED";
 $("bcAutopilotState").dataset.autopilot=!x?.ready?"connecting":on?"active":"paused";
 $("bcAutopilotMetrics").textContent=x?.ready?
  "Queued for AI "+Number(x.unclassified||0)+" · Loaded AI suggestions "+Number(x.analyzed||0)+
  " · This browser today "+Number(x.dailyUsed||0)+"/"+Number(x.dailyMax||20):
  "Waiting for verified private queue";
 $("bcAutopilotSwitch").disabled=!x?.ready||!data.owner;
 $("bcAutopilotSwitch").textContent=on?"Pause AI":"Enable AutoPilot";
 $("bcAutopilotRun").disabled=!x?.ready||!data.owner||!!x.busy;
}
function receiveAutopilot(event){
 const frame=$("bcUploadFrame");
 if(!data.owner||!frame?.contentWindow||event.source!==frame.contentWindow||event.origin!==location.origin)return;
 const x=event.data;
 if(!x||x.type!==BC_AUTOPILOT_STATE||!x.owner||!x.ready)return;
 const before=data.autopilot;
 data.autopilot={ready:true,enabled:!!x.enabled,busy:!!x.busy,paused:!!x.paused,
  unclassified:Math.max(0,Number(x.unclassified)||0),
  analyzed:Math.max(0,Number(x.analyzed)||0),
  dailyUsed:Math.max(0,Number(x.dailyUsed)||0),
  dailyMax:20};
 updateAutopilot();
 if(before?.busy&&!x.busy&&data.owner){
  void Promise.allSettled([loadCatalog(true),loadMemory()]);
  if(gunnerCommand)void gunnerCommand.refresh();
 }
}
function startAutopilot(){
 if(!data.owner)return;
 $("bcAutopilot").hidden=false;
 const frame=$("bcUploadFrame");
 if(!frame.getAttribute("src")){
  frame.addEventListener("load",()=>postAutopilotCommand("status"));
  frame.src="blackcell-upload-queue.html?v=20261117-verified100-r1";
 }else postAutopilotCommand("status");
 updateAutopilot();
}
function classificationStage(item){
 if(!item||!["asset","stream_video"].includes(item.type)||!["photo","video"].includes(item.kind))return "not_applicable";
 if(!data.memoryLoaded)return "loading";
 const references=data.learning.filter(x=>x.source_kind===item.type&&x.source_id===item.id);
 if(references.some(x=>x.reference_status==="verified"))return "verified";
 if(item.type==="stream_video")return references.length?"ai_suggested":"needs_ai";
 const a=ai(item);
 if(a?.status==="approved")return "verified";
 if(a?.status==="suggested"){
  const world=worldTags(a.tags);
  if(a.confidence==="low"||world==="unsorted"||!world)return "needs_verification";
  return "ai_suggested";
 }
 if(references.length)return "ai_suggested";
 return "needs_ai";
}
const CLASSIFICATION_LABELS={
 loading:"AI STATUS LOADING",needs_ai:"NEEDS AI ANALYSIS",
 ai_suggested:"AI CLASSIFIED · UNVERIFIED",
 needs_verification:"NEEDS VERIFICATION",verified:"CLASSIFICATION VERIFIED",
 not_applicable:"—"
};
const publicationLabel=item=>item.status==="pending"?"PENDING PUBLICATION APPROVAL":
 item.status==="approved"?"PUBLICATION APPROVED":
 item.status==="rejected"?"PUBLICATION REJECTED":item.status.toUpperCase();

function renderStreamEmbed(){
 const record=data.streamPlayback,item=data.selected;
 if(!item||item.type!=="stream_video"||!record||record.key!==item.key)return;
 const active=data.page==="catalog"?"bcPreview":data.page==="teach"?"bcTeachPreview":null;
 if(active&&Number(record.expires||0)*1000<Date.now()+5000){
  data.streamPlayback=null;void preview(item);return;
 }
 for(const id of ["bcPreview","bcTeachPreview"]){
  const box=$(id),current=box.querySelector("iframe");
  if(id===active&&current?.dataset.streamUrl===record.url)continue;
  if(current){current.src="about:blank";current.remove()}
  if(id===active){
   const frame=document.createElement("iframe");
   frame.title="Secure BLACKCELL Tube playback";
   frame.src=record.url;frame.dataset.streamUrl=record.url;
   frame.referrerPolicy="no-referrer";
   frame.allow="autoplay; encrypted-media; picture-in-picture; fullscreen";
   frame.allowFullscreen=true;box.replaceChildren(frame);
  }else{
   const hint=E("div","bc-preview-empty");
   hint.append(E("span","","▷"),E("b","","Secure BLACKCELL Tube video"));
   box.replaceChildren(hint);
  }
 }
}

/* Owner-only integrated manual review; the old Media Import Processor page
 * is no longer required to approve, reject, classify or file media. */
const reviewState={user:null,member:null,assets:[],bunnyWaitingCount:0};
const REVIEW_COUNTRIES="US CN GB CA AU FR DE IN JP KR BR RU UA IT ES MX ZA EG NG KE TR IL PK ID PH TH VN NZ SE NO FI DK NL BE PL CZ GR RO CH AT SG MY AR CL CO PE AE SA QA JO IQ IR AF BD LK NP MM KH LA TW KP MN KZ UZ GE AM AZ LT LV EE RS HR SI SK HU BG PT IE IS MA DZ TN LY ET GH CM CI SN UG TZ RW ZW ZM AO MZ NA BW MW MG CD CG GA GQ SO SD SS YE OM KW BH CY MT LU AL BA ME MK MD BY AD AE AG AI AO AQ AS AW AX BB BF BI BJ BL BM BN BO BQ BS BT BV BZ CC CD CF CG CI CK CL CM CO CR CU CV CW CX CY DJ DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO GA GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT ID IE IM IO IS JE JM JO KE KG KH KI KM KN KP KW KY KZ LA LB LC LI LR LS LT LU LV LY MA MC MD ME MF MG MH ML MM MO MP MQ MR MS MT MU MV MX MY MZ NC NE NF NG NI NL NO NP NR NU OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UG UM UY UZ VA VC VE VG VI VU WF WS YT ZA ZM ZW".split(/\s+/);
function populateReviewOptions(){
 const sel=$("militaryUploadCountry");
 if(!sel||sel.options.length>1)return;
 const names=typeof Intl.DisplayNames==="function"?new Intl.DisplayNames(["en"],{type:"region"}):null;
 const values=[...new Set(REVIEW_COUNTRIES)].sort((a,b)=>(names?.of(a)||a).localeCompare(names?.of(b)||b));
 for(const code of values)sel.add(new Option((names?.of(code)||code)+" ("+code+")",code));
}
async function syncApprovalSources(){
 const r=await db.from("corp_social_assets").select("*").eq("review_status","pending")
  .in("kind",["photo","video"]).order("created_at",{ascending:true}).limit(1000);
 if(r.error)throw r.error;
 reviewState.assets=r.data||[];
}
async function ensurePublicationReview(){
 if(!data.owner||publicationReviewLoading)return;
 if(publicationReview){await publicationReview.refresh();return}
 publicationReviewLoading=true;
 text("bcProcessStatus","Loading verified photo and video publication workbench…");
 try{
  populateReviewOptions();
  reviewState.user=data.user;
  reviewState.member={role:"owner",clearance_level:7};
  await syncApprovalSources();
  const [{createBlackcellUniformApproval},{setupBlackcellBunnyReview},{createUniformReviewAI}]=await Promise.all([
   import("./blackcell-uniform-approval.js?v=20261117-integrated-r1"),
   import("./corporate-bunny-review.js?v=20261112-command1"),
   import("./blackcell-uniform-approval-ai.js?v=20261117-integrated-r1")
  ]);
  const bucket=db.storage.from("corp-social-media");
  const toast=message=>text("bcProcessStatus",String(message||"").slice(0,250));
  const refresh=async()=>{
   await Promise.allSettled([loadCatalog(true),loadMemory(),syncApprovalSources()]);
   if(gunnerCommand)void gunnerCommand.refresh();
  };
  publicationReview=createBlackcellUniformApproval({
   client:db,bucket,state:reviewState,refresh,toast,
   mediaUrl:()=>"",openAIReview:createUniformReviewAI({client:db,bucket,userId:data.user.id})
  });
  publicationReview.setup();
  setupBlackcellBunnyReview({client:db,state:reviewState,refresh:async()=>{await refresh();await publicationReview.refresh()},toast});
 }catch(err){
  text("bcProcessStatus","Could not load the private review workbench: "+String(err?.message||err).slice(0,240));
 }finally{publicationReviewLoading=false}
}

function switchTab(page,keepSelection=false){
 if(!data.owner&&page!=="uploads")return;
 if(page==="teach"&&data.selected?.kind==="video"&&data.selected?.type==="asset"){
  const source=$("bcPreview").querySelector("video"),target=$("bcTeachPreview").querySelector("video");
  if(source&&target&&Number.isFinite(source.currentTime)){
   source.pause();
   const position=source.currentTime;
   if(target.readyState>0){try{target.currentTime=position}catch{}}
   else target.addEventListener("loadedmetadata",()=>{try{target.currentTime=position}catch{}},{once:true});
   data.frame=Math.max(0,Math.floor(position));
  }
 }
 data.page=page;
 for(const b of document.querySelectorAll(".bc-tab"))b.setAttribute("aria-selected",String(b.dataset.tab===page));
 for(const n of ["catalog","teach","learning","atlas","gunner","review","uploads"])
  $("bcPage"+n[0].toUpperCase()+n.slice(1)).hidden=!(n===page||(n==="catalog"&&page==="completed"));
 if(page==="catalog"||page==="completed"){
  const completed=page==="completed";
  text("bcInventoryTitle",completed?"Completed Inventory":"Content Inventory");
  text("bcInventoryDescription",completed?
   "Approved and rejected photos and videos are archived here after publication review. Records stay in their protected source libraries; this is not a second copy.":
   "Incoming photos and videos awaiting Tech AI. Analyzed records leave this queue automatically. Nothing is deleted.");
  text("bcInventoryListTitle",completed?"COMPLETED RECORDS":"AWAITING TECH AI");
  $("bcFilterStatus").value="all";
  list();
 }
 if(page==="teach"){
  if(!keepSelection&&flowStage(data.selected)!=="teach")selectNextTechItem();
  renderTechQueue();fillForm();
 }
 if(data.selected?.type==="stream_video")renderStreamEmbed();
 if(page==="learning"){
  renderLearningDashboard();
  if(visualMemory)void visualMemory.refresh();
  if(uniformSemantic)void uniformSemantic.refresh();
 }
 if(page==="atlas"){drawAtlas();drawPatterns()}
 if(page==="gunner")gunnerCommand?.open();
 if(page==="review")void ensurePublicationReview();
 if(page==="uploads"&&!$("bcUploadFrame").getAttribute("src")){$("bcUploadFrame").src="blackcell-upload-queue.html?v=20261117-ai-autosort-r3"}
}
async function loadCatalog(reset=false){
 if(data.loading)return;data.loading=true;$("bcRefreshAll").disabled=true;
 if(reset){data.items=[];for(const s of index){s.skip=0;s.done=false;s.error=""}}
 try{
  await Promise.all(index.map(async spec=>{
   if(spec.done||spec.error)return;
   const r=await db.from(spec.table).select(spec.fields,{count:"exact"}).order(spec.order,{ascending:false}).range(spec.skip,spec.skip+99);
   if(r.error){spec.error=r.error.message;return}
   for(const raw of r.data||[]){const v=wrap(spec.type,raw);if(!data.items.some(x=>x.key===v.key))data.items.push(v)}
   spec.skip+=(r.data||[]).length;spec.done=(r.data||[]).length<100||spec.skip>=r.count;
  }));
  if(data.selected){
   const updated=data.items.find(item=>item.key===data.selected.key);
   data.selected=updated||null;
  }
  render();
 }finally{data.loading=false;$("bcRefreshAll").disabled=false}
}
async function loadMemory(){
 if(!data.owner)return;
 const [r,a]=await Promise.all([
  db.from("corp_uniform_training_references").select("*").eq("owner_id",data.user.id).order("updated_at",{ascending:false}).limit(1000),
  db.from("corp_social_ai_analysis").select("asset_id,status,country_code,military_branch,military_category,uniform_type,camouflage_pattern,confidence,tags,notes,original_suggestion,learned_from_count,model,attempts,updated_at").eq("owner_id",data.user.id).limit(1000)
 ]);
 if(r.error)throw Error(r.error.message);
 data.learning=r.data||[];data.ai=a.data||[];data.memoryLoaded=!a.error;
 // Optional usage counters must never block normal media loading.
 const usage=await db.from("corp_uniform_video_ai_usage").select("requests").eq("owner_id",data.user.id).eq("usage_day",new Date().toISOString().slice(0,10)).maybeSingle();
 data.videoUsageToday=usage.error?null:Number(usage.data?.requests||0);
 if(a.error)text("bcCatalogMeta","AI analysis source unavailable: "+a.error.message);
 render();
}
function stats(){
 const items=data.items,confirmed=data.learning.filter(x=>x.reference_status==="verified");
 const counts={catalog:0,teach:0,review:0,completed:0};
 for(const item of items){const stage=flowStage(item);if(stage in counts)counts[stage]++}
 for(const [id,key] of [["bcInventoryTabCount","catalog"],["bcTechTabCount","teach"],["bcReviewTabCount","review"],["bcCompletedTabCount","completed"]])text(id,counts[key]);
 for(const [key,value] of [["bcTotal",items.length],["bcPhotos",items.filter(x=>x.kind==="photo").length],
 ["bcVideos",items.filter(x=>x.kind==="video").length],["bcPending",items.filter(x=>x.status==="pending").length],
 ["bcTrained",confirmed.length],["bcCountriesCount",new Set(confirmed.map(x=>x.country_code).filter(Boolean)).size]])text(key,value);
 const extra=index.some(x=>!x.done&&!x.error),failed=index.filter(x=>x.error);
 $("bcLoadMore").hidden=!extra;
 text("bcPagingStatus",items.length+" records indexed"+(extra?" · more available":""));
 text("bcCatalogScope",failed.length?"PARTIAL · "+failed.length+" UNAVAILABLE":"LIVE PRIVATE CATALOG");
 const stageSummary=data.memoryLoaded?
  "Incoming "+counts.catalog+" · Tech AI "+counts.teach+" · Review "+counts.review+" · Completed "+counts.completed:
  "Classification index loading";
 text("bcCatalogMeta",failed.length?failed.map(x=>x.table+": "+x.error).join(" | ").slice(0,170):stageSummary);
}
function match(item){
 const lab=labels(item),q=$("bcSearch").value.toLowerCase().trim();
 if($("bcFilterKind").value!=="all"&&$("bcFilterKind").value!==item.kind)return false;
 const statusFilter=$("bcFilterStatus").value;
 if(statusFilter!=="all"&&
   (["needs_ai","ai_suggested","needs_verification","verified"].includes(statusFilter)?
   classificationStage(item)!==statusFilter:item.status!==statusFilter))return false;
 if($("bcFilterWorld").value!=="all"&&$("bcFilterWorld").value!==lab.world)return false;
 if($("bcFilterSource").value!=="all"&&$("bcFilterSource").value!==item.source)return false;
 return !q||[item.title,item.desc,item.status,item.source,item.category,lab.country,country(lab.country),lab.branch,lab.uniform,...item.tags].join(" ").toLowerCase().includes(q);
}
function list(){
 const h=$("bcInventory");h.replaceChildren();
 const scope=data.page==="completed"?"completed":"catalog";
 const items=data.items.filter(item=>flowStage(item)===scope&&match(item)).sort((a,b)=>Date.parse(b.date||0)-Date.parse(a.date||0));
 text("bcResultCount"," · "+items.length);
 for(const item of items){
  const v=labels(item),b=E("button","bc-list-row"),ico=E("span","bc-list-icon",item.kind==="photo"?"▧":item.kind==="video"?"▷":"≡"),name=E("span","bc-list-main"),chips=E("span","bc-list-tags");
  b.type="button";b.dataset.itemKey=item.key;b.setAttribute("role","option");b.setAttribute("aria-selected",String(item.key===data.selected?.key));
  ico.dataset.kind=item.kind;
  name.append(E("strong","",item.title),E("small","",[item.source.toUpperCase(),W[v.world],v.country||"COUNTRY UNKNOWN",v.branch!=="Unspecified"?v.branch:""].filter(Boolean).join(" · ")));
  const stage=classificationStage(item);
  if(stage!=="not_applicable"){
   const label=E("span","bc-pill bc-classification-pill",CLASSIFICATION_LABELS[stage]);
   label.dataset.status=stage;chips.append(label);
  }
  const status=E("span","bc-pill bc-publication-pill",publicationLabel(item));
  status.dataset.status=item.status;chips.append(status);
  const r=ref(item);if(r){const c=E("span","bc-pill",r.reference_status.toUpperCase());c.dataset.status=r.reference_status;chips.append(c)}
  b.append(ico,name,chips);b.onclick=()=>select(item);h.append(b);
 }
 if(!items.length)h.append(E("p","bc-empty",scope==="completed"?"No completed photos or videos match these filters.":"No incoming photos or videos are waiting in this view."));
 if(data.page===scope&&!items.some(item=>item.key===data.selected?.key)){
  if(items[0])select(items[0]);
  else if(data.selected){
   data.selected=null;data.frame=0;clearPreview();placeholder("Select a photo or video from this stage");
   text("bcSelectionStatus","NONE SELECTED");text("bcItemTitle","No item selected");
   text("bcItemSource","Choose an item to inspect its private classification.");$("bcItemFacts").replaceChildren();
   $("bcTeachSelected").disabled=true;$("bcAnalyzeSelected").disabled=true;
  }
 }
}
function selectNextTechItem(){
 const next=data.items.find(item=>flowStage(item)==="teach");
 if(next){select(next);return}
 data.selected=null;data.frame=0;clearPreview();
 placeholder("Tech AI queue is clear · completed records have moved right");
}
function renderTechQueue(){
 const host=$("bcTechQueue");if(!host)return;
 const items=data.items.filter(item=>flowStage(item)==="teach").sort((a,b)=>Date.parse(b.date||0)-Date.parse(a.date||0));
 text("bcTechQueueCount",items.length+" loaded");host.replaceChildren();
 if(!items.length){host.append(E("span","bc-tech-queue-empty","No classified media waiting for Tech AI verification. New AI suggestions will appear here."));return}
 for(const item of items.slice(0,30)){
  const button=E("button","bc-tech-queue-item",item.kind==="video"?"▷ ":"▧ ");
  button.type="button";
  button.append(E("span","",item.title),E("small","",CLASSIFICATION_LABELS[classificationStage(item)]));
  button.setAttribute("aria-pressed",String(item.key===data.selected?.key));
  button.onclick=()=>{select(item);fillForm();renderTechQueue()};
  host.append(button);
 }
 if(items.length>30)host.append(E("span","bc-tech-queue-empty","Showing first 30 loaded suggestions; remaining items appear as these are verified."));
}
function clearPreview(){
 ++data.previewGeneration;
 data.videoFrame=null;data.streamPlayback=null;
 $("bcFrameStillPreview").hidden=true;$("bcFrameStillPreview").removeAttribute("src");$("bcFrameStillInput").value="";
 for(const box of ["bcPreview","bcTeachPreview"]){
  for(const frame of $(box).querySelectorAll("iframe")){frame.src="about:blank"}
 }
 if(data.blob){URL.revokeObjectURL(data.blob);data.blob=""}
 for(const id of ["bcPreview","bcTeachPreview"]){const target=$(id);for(const v of target.querySelectorAll("video")){v.pause();v.removeAttribute("src");v.load()}target.replaceChildren()}
}
function placeholder(s){
 for(const id of ["bcPreview","bcTeachPreview"]){const box=E("div","bc-preview-empty");box.append(E("span","","▧"),E("b","",s));$(id).replaceChildren(box)}
}
async function preview(item){
 clearPreview();const seq=data.previewGeneration;
 if(item.type==="stream_video"){
  placeholder("Opening authorized BLACKCELL Tube stream…");
  try{
   const r=await db.functions.invoke("blackcell-video-stream-api",{body:{action:"play",catalogId:item.id}});
   if(r.error){let details=r.error.message;try{const b=await r.error.context?.json?.();details=b?.error||details}catch{}
    throw Error(details==="video_still_processing"?"Video is still processing. Try Refresh after encoding completes.":details)}
   if(!r.data?.ok||typeof r.data.url!=="string"||!/^https:\/\/player\.mediadelivery\.net\/embed\//.test(r.data.url))
    throw Error("Secure streaming URL is not available.");
   if(seq!==data.previewGeneration||data.selected?.key!==item.key)return;
   data.streamPlayback={key:item.key,url:r.data.url,expires:r.data.expires||0};
   renderStreamEmbed();
   text("bcFrameStatus","BLACKCELL Tube uses one secure embedded player. Choose a frame timestamp, take a screenshot, and use Choose Still Image before analyzing.");
  }catch(err){
   if(seq===data.previewGeneration)placeholder("Bunny Stream preview unavailable: "+String(err.message||err).slice(0,130));
  }
  return;
 }
 if(item.type!=="asset"){placeholder("Catalog record has no attached media");return}
 placeholder("Opening protected file…");
 try{
  let url="";
  if(item.provider==="world-bunny-v1"){
   const auth=await db.auth.getSession(),cfg=window.BLACKCELL_CORP_CONFIG||{};
   if(!auth.data.session?.access_token||!cfg.url||!cfg.publishableKey)throw Error("Session or media reader missing");
   const r=await fetch(new URL("/functions/v1/blackcell-world-media?action=read",cfg.url),{method:"POST",
    headers:{"authorization":"Bearer "+auth.data.session.access_token,"apikey":cfg.publishableKey,"content-type":"application/json"},
    body:JSON.stringify({id:item.id})});
   if(!r.ok)throw Error("Private media HTTP "+r.status);
   const blob=await r.blob();if(!blob.size||blob.size>45*1048576)throw Error("Unsupported file size");
   url=URL.createObjectURL(blob);
  }else{
   const s=await db.storage.from("corp-social-media").createSignedUrl(item.path,120);
   if(s.error||!s.data?.signedUrl)throw Error("Signed photo preview unavailable");
   url=s.data.signedUrl;
  }
  if(seq!==data.previewGeneration||data.selected?.key!==item.key){if(url.startsWith("blob:"))URL.revokeObjectURL(url);return}
  if(url.startsWith("blob:"))data.blob=url;
  for(const id of ["bcPreview","bcTeachPreview"]){
   const node=document.createElement(item.kind==="video"?"video":"img");
   if(item.kind==="video"&&!url.startsWith("blob:"))node.crossOrigin="anonymous";
   node.src=url;
   if(item.kind==="video"){
    node.controls=true;node.preload="metadata";node.playsInline=true;
    node.addEventListener("play",()=>{const other=id==="bcPreview"?"bcTeachPreview":"bcPreview";
      const peer=$(other).querySelector("video");if(peer&&!peer.paused)peer.pause()});
    if(id==="bcTeachPreview"){
     const sync=()=>{
      if(data.selected?.key!==item.key)return;
      const seconds=Math.max(0,Math.floor(node.currentTime||0));
      if(seconds!==data.frame){
       data.frame=seconds;$("bcTrainTime").value=fmtTime(seconds);
       data.videoFrame=null;$("bcFrameStillPreview").hidden=true;
       $("bcAnalyzeVideoFrame").disabled=!canVideoAnalyze(item);
       drawPatternMatches(item);
      }
      text("bcFrameStatus","Paused/selected frame at "+fmtTime(seconds)+
       (Number.isFinite(node.duration)?" / "+fmtTime(node.duration):"")+
       ". Capture current frame, then request AI suggestions.");
     };
     node.addEventListener("pause",sync);node.addEventListener("seeked",sync);
     node.addEventListener("error",()=>{if(data.selected?.key===item.key)text("bcFrameStatus","This video codec or signed playback link cannot be decoded here. Use Choose Still Image from the video as a fallback.");});
    }
   }else node.alt="Protected BLACKCELL image";
   $(id).replaceChildren(node);
  }
 }catch(err){if(seq===data.previewGeneration)placeholder("Preview unavailable · "+String(err.message||err).slice(0,100))}
}
function fact(label,value){const box=E("div","bc-fact");box.append(E("small","",label),E("b","",value||"—"));return box}
function select(item){
 data.selected=item;data.frame=0;data.videoFrame=null;data.timelineFrames.clear();
 $("bcTimelineResults").replaceChildren();text("bcTimelineStatus","Optional scan: up to 4 video frames, only after you approve an external AI request.");
 const videoCanUse=canTeach(item)&&item.owner===data.user?.id&&!item.adult&&item.kind==="video";
 $("bcVideoFrameControls").hidden=!videoCanUse;
 $("bcCaptureFrame").disabled=!(videoCanUse&&item.type==="asset");
 $("bcAnalyzeVideoFrame").disabled=!videoCanUse;
 $("bcScanVideoTimeline").disabled=!(videoCanUse&&item.type==="asset");
 $("bcFrameStillPreview").hidden=true;$("bcFrameStillPreview").removeAttribute("src");$("bcFrameStillInput").value="";
 text("bcFrameStatus",item.type==="stream_video"?"Loading secure video player… You can choose a still image taken from any frame.":"Pause the video at the frame you want to classify, then select Capture Current Frame.");
 for(const n of $("bcInventory").querySelectorAll("[data-item-key]"))n.setAttribute("aria-selected",String(n.dataset.itemKey===item.key));
 const v=labels(item);
 text("bcSelectionStatus",item.kind.toUpperCase()+" · "+CLASSIFICATION_LABELS[classificationStage(item)]);text("bcItemTitle",item.title);
 text("bcItemSource",item.source.toUpperCase()+" · "+publicationLabel(item)+" · "+CLASSIFICATION_LABELS[classificationStage(item)]);
 $("bcItemFacts").replaceChildren(fact("UNIFORM WORLD",W[v.world]),fact("COUNTRY",country(v.country)),fact("BRANCH",v.branch),
 fact("CATEGORY",v.category),fact("UNIFORM",v.uniform||"Unidentified"),fact("REFERENCE",v.memory),
 fact("AI CONFIDENCE",v.confidence),fact("CLASSIFICATION",CLASSIFICATION_LABELS[classificationStage(item)]),fact("PUBLICATION",publicationLabel(item)),fact("ERA",item.era||"Unknown"),fact("FILE SIZE",item.size?(item.size/1048576).toFixed(1)+" MB":"N/A"));
 $("bcTeachSelected").disabled=!canTeach(item);
 const analyze=$("bcAnalyzeSelected");if(analyze)analyze.disabled=!(item.type==="asset"&&item.kind==="photo"&&item.owner===data.user.id&&!item.adult);
 void preview(item);
}
function drawAtlas(){
 const root=$("bcAtlas");root.replaceChildren();
 const n=data.learning.filter(x=>x.reference_status==="verified").length;
 text("bcAtlasCount",data.learning.length+" reference entries");
 const summary=$("bcAtlasStats");summary.replaceChildren();
 for(const [val,label] of [[n,"VERIFIED REFERENCES"],[data.learning.length-n,"DRAFTS"],[new Set(data.learning.filter(x=>x.reference_status==="verified").map(x=>x.country_code).filter(Boolean)).size,"COUNTRIES"],[data.ai.length,"PHOTO AI ANALYSES"]]){
  const box=E("div","bc-atlas-total");box.append(E("strong","",val),E("small","",label));summary.append(box);
 }
 if(!data.learning.length)root.append(E("p","bc-empty","Select a media item and create your first private uniform comparison."));
 for(const r of data.learning){
  const c=E("article","bc-atlas-card"),left=E("div"),right=E("div","bc-atlas-actions");
  left.append(E("h3","",[country(r.country_code),r.branch!=="Unspecified"?r.branch:"",r.uniform_name].filter(Boolean).join(" · ")),
   E("p","bc-atlas-meta",[W[r.world],r.category,r.era,r.source_kind==="stream_video"?fmtTime(r.frame_seconds):""].filter(Boolean).join(" / ")),
   E("p","",r.visual_evidence||"No evidence entered"));
  if(r.lookalike_country||r.lookalike_branch||r.distinguishing_features)
   left.append(E("p","",("Looks like "+[country(r.lookalike_country),r.lookalike_branch].filter(Boolean).join(" · ")+" — "+r.distinguishing_features).slice(0,1100)));
  const badge=E("span","bc-pill",r.reference_status.toUpperCase());badge.dataset.status=r.reference_status;
  const edit=E("button","bc-btn bc-btn-outline","Edit");edit.type="button";edit.onclick=()=>{
   const item=data.items.find(x=>x.id===r.source_id&&x.type===r.source_kind);
   if(!item){alert("Original media record is no longer available.");return}
   select(item);data.frame=r.frame_seconds;switchTab("teach");fillForm(r);
  };
  right.append(badge,edit);c.append(left,right);root.append(c);
 }
}
function drawPatterns(){
 const root=$("bcPatternReference");if(!root)return;
 const q=$("bcPatternSearch").value.toLowerCase().trim(),filter=$("bcPatternCountry").value;
 const hits=PATTERNS.filter(p=>(filter==="all"||p.origin===filter)&&
  [p.name,p.family,p.uses,p.era,p.origin,p.distinguish].join(" ").toLowerCase().includes(q));
 root.replaceChildren(E("p","bc-pattern-total",hits.length+" source-indexed camouflage patterns. Human verification required."));
 for(const p of hits){
  const row=E("article","bc-pattern-item"),head=E("div","bc-pattern-top"),lhs=E("div");
  lhs.append(E("h3","",p.name),E("small","",[p.family,p.era,p.origin==="multiple"?"Multinational":country(p.origin)].join(" · ")));
  const source=E("a","bc-pattern-source","View source");source.href=CAMO_SOURCES[p.source].url;
  source.target="_blank";source.rel="noopener noreferrer";head.append(lhs,source);
  row.append(head,E("p","","Reported uses: "+p.uses),E("p","bc-pattern-diff","Distinguishing clues: "+p.distinguish),E("span","bc-pattern-flag",p.status));
  root.append(row);
 }
 if(!hits.length)root.append(E("p","bc-empty","No indexed camouflage patterns match this filter."));
 const sources=E("section","bc-pattern-sources");sources.append(E("h3","","RESEARCH SOURCES"));
 for(const source of Object.values(CAMO_SOURCES)){
  const link=E("a","bc-pattern-source",source.name);link.href=source.url;link.target="_blank";link.rel="noopener noreferrer";
  sources.append(link,E("p","",source.note));
 }
 sources.append(E("h3","","SUBMITTED IMAGE · UNVERIFIED"));
 for(const sample of EXTERNAL_SAMPLES){
  const link=E("a","bc-pattern-source","Open original reference image");link.href=sample.url;link.target="_blank";link.rel="noopener noreferrer";
  sources.append(link,E("p","",sample.note));
 }
 root.append(sources);
 const lessons=E("section","bc-comparison-lessons");
 lessons.append(E("h3","","COUNTRY COMPARISON LESSONS · UNVERIFIED"),
 E("p","bc-comparison-note","Based on illustrated charts submitted for BLACKCELL reference. These are label-reading exercises, not authenticated national uniform examples. Verify individual insignia and official issue histories before using them as AI training labels."));
 for(const group of COUNTRY_COMPARISON_LESSONS){
  const panel=E("article","bc-comparison-group");panel.append(E("h4","",group.group),E("p","",group.description));
  const countryList=E("div","bc-comparison-countries");
  for(const info of group.countries){
   const card=E("div","bc-comparison-country"),title=E("strong","",country(info.code)+" · "+info.code);
   card.append(title,E("p","",info.visualClues),E("small","",info.warning));
   countryList.append(card);
  }
  panel.append(countryList);lessons.append(panel);
 }
 root.append(lessons);
}
// Read-only measurements. This never implies image-embedding or weight training.
function renderLearningDashboard(){
 const kpis=$("bcLearningKpis"),details=$("bcLearningDetails"),coverage=$("bcLearningCoverage");
 if(!kpis||!details||!coverage)return;
 kpis.replaceChildren();details.replaceChildren();coverage.replaceChildren();
 if(!data.memoryLoaded){
  details.append(E("p","bc-note","Loading owner-only AI analysis and reference data…"));
  coverage.append(E("p","bc-note","Waiting for catalog records and correction memory."));
  return;
 }
 const verified=data.learning.filter(r=>r.reference_status==="verified"),drafts=data.learning.filter(r=>r.reference_status!=="verified");
 const analyzed=data.ai.length,used=data.ai.filter(x=>Number(x.learned_from_count)>0).length;
 const totalConsultations=data.ai.reduce((n,x)=>n+Math.max(0,Number(x.learned_from_count)||0),0);
 const videoRefs=verified.filter(r=>r.source_kind==="stream_video"||data.items.some(i=>i.id===r.source_id&&i.kind==="video")).length;
 const changes=[];
 for(const ref of verified){
  if(ref.source_kind!=="asset")continue;
  const record=data.ai.find(x=>x.asset_id===ref.source_id),original=record?.original_suggestion;
  if(!original||typeof original!=="object")continue;
  const pairs=[["country_code","country_code"],["branch","military_branch"],["category","military_category"],["uniform_name","uniform_type"],["camouflage_pattern","camouflage_pattern"]];
  const differing=pairs.filter(([left,right])=>String(ref[left]||"").trim().toLowerCase()!==String(original[right]||"").trim().toLowerCase());
  if(differing.length)changes.push({ref,fields:differing.map(x=>x[0])});
 }
 const metric=(value,name,note)=>{
  const card=E("article","bc-learning-metric");
  card.append(E("strong","",value),E("span","",name),E("small","",note));
  kpis.append(card);
 };
 metric(verified.length,"VERIFIED REFERENCES","Owner-confirmed training examples");
 metric(used+" / "+analyzed,"ANALYSES WITH RECALL","Saved analyses using earlier examples");
 metric(changes.length,"CHANGED IDENTIFICATIONS","Verified references differing from original AI output");
 metric(videoRefs,"VERIFIED VIDEO FRAMES","Timestamped reference examples");
 metric(data.videoUsageToday===null?"—":data.videoUsageToday,"VIDEO AI REQUESTS TODAY","UTC day · server-logged requests");
 metric("NOT MEASURED","BLIND-TEST ACCURACY","Needs independent held-out evaluation");
 const metricRow=(label,value)=>{
  const row=E("div","bc-learning-detail-row");
  row.append(E("span","",label),E("strong","",value));
  details.append(row);
 };
 metricRow("AI analysis records",String(analyzed));
 metricRow("Verified / draft reference entries",verified.length+" / "+drafts.length);
 metricRow("Recorded reference consultations",String(totalConsultations));
 metricRow("Saved original AI suggestions",String(data.ai.filter(a=>a.original_suggestion&&typeof a.original_suggestion==="object").length));
 metricRow("Confirmed references with changed fields",String(changes.length));
 metricRow("Measured predictive accuracy","Not available");
 const note=E("div","bc-learning-note");
 note.append(E("strong","","WHAT THESE NUMBERS MEAN"),E("p","","Verified examples can inform future classifications. Changes are counted by comparing human-verified metadata with a saved original AI suggestion, when available. This is not an error rate or proof that the model is retraining its weights."));
 details.append(note);
 const worlds=Object.entries(W).map(([world,name])=>({world,name,count:verified.filter(r=>r.world===world).length})).filter(x=>x.world!=="unsorted").sort((a,b)=>b.count-a.count);
 const max=Math.max(1,...worlds.map(x=>x.count));
 for(const w of worlds){
  const row=E("div","bc-learning-world-row");
  row.append(E("span","",w.name));
  const bar=E("div","bc-learning-bar"),fill=E("div","bc-learning-bar-fill");
  fill.style.width=(w.count/max*100).toFixed(2)+"%";bar.append(fill);
  row.append(bar,E("strong","",w.count));coverage.append(row);
 }
 const noCountry=verified.filter(r=>!r.country_code).length;
 const noUniform=verified.filter(r=>!r.uniform_name).length;
 const noCamo=verified.filter(r=>r.world==="military"&&!r.camouflage_pattern).length;
 const summary=E("div","bc-learning-note");
 summary.append(E("strong","","GAPS IN VERIFIED METADATA"),E("p","","No confirmed country: "+noCountry+" · No uniform designation: "+noUniform+" · Military references without named camouflage: "+noCamo+"."),E("p","","No named pattern can also be correct for plain-color uniforms. Avoid inferring labels without visual evidence."));
 coverage.append(summary);
}
function render(){
 if(data.page==="teach"&&!data.saving&&data.selected&&flowStage(data.selected)!=="teach"){
  const old=data.selected;selectNextTechItem();fillForm();
  text("bcTechQueueStatus",old.title+" moved out of Tech AI. Active queue refreshed.");
 }
 stats();list();renderTechQueue();renderLearningDashboard();drawAtlas();drawPatterns();
}
function formBlank(){
 for(const id of ["bcTrainCountry","bcTrainUniform","bcTrainPattern","bcTrainEra","bcTrainEvidence","bcTrainLookalikeCountry","bcTrainLookalikeBranch","bcTrainDifferences","bcTrainTags"])$(id).value="";
 $("bcTrainWorld").value="unsorted";$("bcTrainBranch").value="Unspecified";$("bcTrainCategory").value="Unsorted";$("bcTrainTime").value="00:00";$("bcTrainConfirmed").checked=false;
}
const canVideoAnalyze=item=>!!item&&canTeach(item)&&item.kind==="video"&&item.owner===data.user?.id&&!item.adult;
const videoSuggestion=item=>item?data.videoSuggestions.get(item.key+":"+data.frame)||null:null;
// Video-frame JPEGs exist only in browser memory until explicit AI consent.
// Bunny Stream iframes are cross-origin: owners can supply a local still instead.
function encodeStill(element,width,height){
 if(!width||!height||width<3||height<3)throw Error("This video frame is not decoded yet. Pause the video after playback starts.");
 const canvas=document.createElement("canvas");
 let ratio=Math.min(1,1280/Math.max(width,height));
 for(let i=0;i<3;i++){
  canvas.width=Math.max(1,Math.round(width*ratio));
  canvas.height=Math.max(1,Math.round(height*ratio));
  const context=canvas.getContext("2d");
  if(!context)throw Error("Your browser cannot capture this frame.");
  context.drawImage(element,0,0,canvas.width,canvas.height);
  const jpeg=canvas.toDataURL("image/jpeg",i===0?.83:.66);
  if(jpeg.length<4_150_000)return jpeg;
  ratio*=.7;
 }
 throw Error("Selected still is larger than the private AI limit. Choose a smaller screenshot.");
}
function setVideoStill(url,seconds,kind){
 const item=data.selected;
 if(!canVideoAnalyze(item))throw Error("Select a non-restricted video that belongs to you.");
 if(!Number.isInteger(seconds)||seconds<0||seconds>86400)throw Error("Video frame time must be 0–24 hours.");
 data.frame=seconds;
 $("bcTrainTime").value=fmtTime(seconds);
 data.videoFrame={key:item.key,seconds,url,kind};
 $("bcFrameStillPreview").src=url;$("bcFrameStillPreview").hidden=false;
 $("bcAnalyzeVideoFrame").disabled=false;
 text("bcFrameStatus","Selected "+kind+" at "+fmtTime(seconds)+". Ready for private AI suggestions; no frame has been uploaded yet.");
 drawPatternMatches(item);
}
async function captureCurrentFrame(){
 const item=data.selected;
 if(!canVideoAnalyze(item)||item.type!=="asset"){
  text("bcFrameStatus","Bunny Stream is an isolated player. Pause at the desired timestamp, save a still image, then choose it using the still-image control.");return false;
 }
 const player=$("bcTeachPreview").querySelector("video");
 if(!player){text("bcFrameStatus","Video preview is not yet available. Select a screenshot using Choose Still Image.");return false}
 try{
  if(player.readyState<2)throw Error("Allow playback to start and pause at a visible frame first.");
  player.pause();
  const frame=Math.max(0,Math.floor(player.currentTime||0));
  const jpeg=encodeStill(player,player.videoWidth,player.videoHeight);
  setVideoStill(jpeg,frame,"captured frame");
  return true;
 }catch(err){text("bcFrameStatus","Frame capture unavailable: "+String(err.message||err).slice(0,190)+". Choose a still image instead.");return false}
}
async function pickVideoStill(file){
 const item=data.selected;
 if(!canVideoAnalyze(item))return;
 if(!file)return;
 if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size<=0||file.size>12*1048576){
  text("bcFrameStatus","Choose a JPEG, PNG or WEBP still image under 12 MB.");return;
 }
 let blobUrl;
 try{
  const seconds=secs($("bcTrainTime").value);
  if(seconds>86400)throw Error("Frame timestamp exceeds 24 hours.");
  blobUrl=URL.createObjectURL(file);
  const image=new Image();image.src=blobUrl;
  await image.decode();
  if(data.selected?.key!==item.key)return;
  const jpeg=encodeStill(image,image.naturalWidth,image.naturalHeight);
  setVideoStill(jpeg,seconds,"local still");
 }catch(err){text("bcFrameStatus","Could not read this video still: "+String(err.message||err).slice(0,170))}
 finally{if(blobUrl)URL.revokeObjectURL(blobUrl)}
}
async function analyzeVideoFrame(){
 const item=data.selected;
 if(data.videoBusy||!canVideoAnalyze(item))return;
 let seconds;
 try{seconds=secs($("bcTrainTime").value);if(seconds>86400)throw Error("Time exceeds 24 hours")}catch(err){text("bcFrameStatus",String(err.message||err));return}
 if(!data.videoFrame||data.videoFrame.key!==item.key||data.videoFrame.seconds!==seconds){
  if(item.type==="asset"){
   if(!(await captureCurrentFrame()))return;
   seconds=data.videoFrame.seconds;
  }else{
   text("bcFrameStatus","For secure Bunny Stream, select a still image from "+fmtTime(seconds)+" before analyzing. The embedded player cannot share pixels across websites.");
   return;
  }
 }
 const frame=data.videoFrame;
 if(!confirm("Send ONE still image at "+fmtTime(seconds)+" to BLACKCELL's external vision provider for private AI suggestions? This uses API credits (maximum 20 video frames/day). The video is never sent, and nothing is approved or published."))return;
 data.videoBusy=true;$("bcAnalyzeVideoFrame").disabled=true;
 text("bcFrameStatus","Analyzing one selected video frame. Your original stays private…");
 try{
  const r=await db.functions.invoke("blackcell-military-ai",{body:{
   action:"analyze_frame",source_kind:item.type,source_id:item.id,
   frame_seconds:seconds,preview_image:frame.url
  }});
  if(r.error){let details=r.error.message;try{const body=await r.error.context?.json?.();details=body?.error||details}catch{}throw Error(details)}
  if(!r.data?.ok||!r.data.analysis)throw Error(r.data?.error||"AI returned no frame classification");
  data.videoSuggestions.set(item.key+":"+seconds,r.data);
  if(data.selected?.key===item.key&&data.frame===seconds){
   fillForm(ref(item,seconds));
   $("bcTrainConfirmed").checked=false;
   text("bcTrainStatus","Unverified video frame suggestions loaded for "+fmtTime(seconds)+". Review country, branch, pattern, tags and evidence before saving a draft or verifying.");
   text("bcFrameStatus","AI suggestions loaded. "+r.data.remaining+" video-frame requests remain today. Nothing was published.");
  }
 }catch(err){text("bcFrameStatus","Video AI unavailable: "+String(err.message||err).slice(0,210)+". Existing video and references were not changed.")}
 finally{data.videoBusy=false;$("bcAnalyzeVideoFrame").disabled=!canVideoAnalyze(data.selected)}
}
// Opt-in timeline sampling: browser-decoded video frames, no automatic verification or publication.
async function seekPreviewForScan(player,seconds){
 if(!Number.isFinite(player.duration)||player.duration<=0||!player.seekable?.length)throw Error("Video cannot be seeked here. Choose a still instead.");
 if(Math.abs(player.currentTime-seconds)<.1&&player.readyState>=2)return;
 await new Promise((resolve,reject)=>{
  let timer;
  const clean=()=>{clearTimeout(timer);player.removeEventListener("seeked",done);player.removeEventListener("error",fail)};
  const done=()=>{clean();resolve()};
  const fail=()=>{clean();reject(Error("Cannot seek to "+fmtTime(seconds)))};
  timer=setTimeout(()=>{clean();reject(Error("Seek timed out; use a shorter local video."))},12000);
  player.addEventListener("seeked",done,{once:true});player.addEventListener("error",fail,{once:true});
  try{player.currentTime=seconds}catch(err){clean();reject(err)}
 });
 if(player.readyState<2)throw Error("This frame did not decode.");
}
function renderTimelineResults(item,results){
 const host=$("bcTimelineResults");host.replaceChildren();
 for(const frame of results){
  const row=E("button","bc-timeline-result");row.type="button";
  row.append(E("strong","",fmtTime(frame.seconds)),E("span","",[frame.analysis.military_branch||"Unspecified",frame.analysis.camouflage_pattern||"Pattern unknown"].join(" · ")),E("small","","REVIEW UNVERIFIED"));
  row.onclick=()=>{
   if(data.selected?.key!==item.key)return;
   const image=data.timelineFrames.get(item.key+":"+frame.seconds);if(!image)return;
   setVideoStill(image,frame.seconds,"sampled video frame");fillForm(ref(item,frame.seconds));
   $("bcTrainConfirmed").checked=false;
   text("bcFrameStatus","Sample "+fmtTime(frame.seconds)+" selected. Review and correct before saving; nothing was published.");
  };
  host.append(row);
 }
}
async function scanVideoTimeline(){
 const item=data.selected;if(data.videoBusy||!canVideoAnalyze(item))return;
 if(item.type!=="asset"){text("bcTimelineStatus","Bunny Stream is cross-origin; this feature currently needs a directly playable upload.");return}
 const player=$("bcTeachPreview").querySelector("video");
 if(!player||!Number.isFinite(player.duration)||player.duration<=0){text("bcTimelineStatus","Start video playback to load metadata, then try Scan 4 Video Moments.");return}
 const duration=Math.min(player.duration,86400);
 const times=[...new Set([.15,.38,.62,.85].map(x=>Math.max(0,Math.floor(Math.min(duration-0.15,duration*x)))))];
 if(!times.length)return;
 if(!confirm("Send up to "+times.length+" sampled video frames for private external AI analysis? This may consume "+times.length+" paid frame requests (daily server limit applies). The original video is not uploaded, and nothing is approved or published."))return;
 data.videoBusy=true;$("bcAnalyzeVideoFrame").disabled=true;$("bcScanVideoTimeline").disabled=true;
 const oldTime=player.currentTime,results=[];player.pause();
 $("bcTimelineResults").replaceChildren();
 try{
  for(let i=0;i<times.length;i++){
   if(data.selected?.key!==item.key)throw Error("Selected media changed.");
   const seconds=times[i];
   text("bcTimelineStatus","Scanning "+(i+1)+"/"+times.length+" at "+fmtTime(seconds)+"…");
   await seekPreviewForScan(player,seconds);
   const jpeg=encodeStill(player,player.videoWidth,player.videoHeight);
   const r=await db.functions.invoke("blackcell-military-ai",{body:{action:"analyze_frame",source_kind:item.type,source_id:item.id,frame_seconds:seconds,preview_image:jpeg}});
   if(r.error){let msg=r.error.message;try{msg=(await r.error.context?.json?.())?.error||msg}catch{}throw Error(msg)}
   if(!r.data?.ok||!r.data.analysis)throw Error(r.data?.error||"AI returned no classification");
   data.videoSuggestions.set(item.key+":"+seconds,r.data);data.timelineFrames.set(item.key+":"+seconds,jpeg);
   results.push({seconds,analysis:r.data.analysis});renderTimelineResults(item,results);
  }
  text("bcTimelineStatus",results.length+" sampled frames analyzed. Select timestamps to review. All suggestions remain unverified.");
 }catch(err){
  text("bcTimelineStatus","Scanned "+results.length+"/"+times.length+" frames. Stopped: "+String(err?.message||err).slice(0,170)+". Existing results remain available.");
 }finally{
  if(data.selected?.key===item.key){try{player.currentTime=oldTime}catch{}}
  data.videoBusy=false;$("bcAnalyzeVideoFrame").disabled=!canVideoAnalyze(data.selected);
  $("bcScanVideoTimeline").disabled=!(canVideoAnalyze(data.selected)&&data.selected.type==="asset");
 }
}
function drawPatternMatches(item){
 const root=$("bcPatternMatches");
 root.replaceChildren();
 const photoAllowed=!!item&&item.type==="asset"&&item.kind==="photo"&&item.owner===data.user?.id&&!item.adult;
 $("bcSuggestPattern").disabled=!photoAllowed;
 const videoAllowed=canVideoAnalyze(item);
 if(!photoAllowed&&!videoAllowed){
  root.append(E("p","bc-pattern-ai-empty","Select one of your own non-restricted photos or video frames for AI pattern ranking."));
  return;
 }
 const row=photoAllowed?ai(item):null,video=videoAllowed?videoSuggestion(item):null;
 const saved=video?video.pattern_suggestions:row?.original_suggestion?.camouflage_matches;
 if(!saved||!Array.isArray(saved.candidates)){
  if(row?.camouflage_pattern)root.append(E("p","bc-pattern-ai-empty","Earlier AI guess: "+row.camouflage_pattern+". Run new suggestions to compare alternatives."));
  else root.append(E("p","bc-pattern-ai-empty",videoAllowed?"No ranked suggestions yet for this frame. Capture a video still or choose a still image, then select Analyze This Frame with AI.":"No ranked camouflage analysis yet. Select Suggest Top 3 Patterns."));
  return;
 }
 const visibility=String(saved.visibility||"not_visible");
 const candidates=saved.candidates.slice(0,3).filter(x=>x&&typeof x.name==="string"&&x.name.length);
 const lead=E("p","bc-pattern-match-summary",
  "Visibility: "+visibility.replaceAll("_"," ")+" · "+
  (saved.summary||"AI reviewed visible camouflage details.")+
  " Ranked match scores are estimates, not calibrated probabilities.");
 root.append(lead);
 if(!candidates.length){
  root.append(E("p","bc-pattern-ai-empty","No defensible named camouflage pattern identified. Leave the field blank or enter a manually verified designation."));
  return;
 }
 candidates.sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0));
 candidates.forEach((x,i)=>{
  const card=E("article","bc-pattern-match-card"+(i===0?" bc-pattern-best":""));
  const top=E("div","bc-pattern-match-head");
  const title=E("div","bc-pattern-match-title");
  title.append(E("span","bc-pattern-match-rank",i===0?"BEST VISUAL MATCH":"POSSIBILITY "+(i+1)),E("strong","",x.name));
  const score=E("span","bc-pattern-match-score",Math.max(0,Math.min(100,Math.round(Number(x.score)||0)))+"/100");
  top.append(title,score);
  const reason=E("p","bc-pattern-match-reason",x.visual_evidence||"No distinguishing visual evidence reported.");
  const clue=E("p","bc-pattern-match-difference",x.distinguishing_clue||"Check insignia and official issue patterns for this design.");
  const use=E("button","bc-btn bc-btn-outline bc-pattern-use","Use as draft");
  use.type="button";
  use.onclick=()=>{
   $("bcTrainPattern").value=String(x.name).slice(0,130);
   $("bcTrainConfirmed").checked=false;
   text("bcTrainStatus","Selected an unverified AI pattern suggestion. Check a reliable pattern reference and visible features before approving this label; no record has been saved.");
  };
  card.append(top,reason,clue,use);root.append(card);
 });
 root.append(E("small","bc-pattern-match-warning","Pattern resemblance cannot prove nationality, branch, rank, service history, or the authenticity of a uniform. Compare against source imagery and verify manually."));
}
function fillForm(exact){
 const item=data.selected;formBlank();text("bcTeachTitle",item?.title||"No media selected");
 text("bcTeachSourceHint",item?[item.source,item.kind,item.status].join(" · "):"Select a photo or video in the inventory");
 const allowed=canTeach(item),r=exact||ref(item,data.frame)||(item?.kind==="video"?null:ref(item,0));
 $("bcSaveDraft").disabled=!allowed;$("bcVerifyReference").disabled=!allowed||!!item?.adult;
 $("bcTrainTime").disabled=!allowed||item?.kind!=="video";$("bcDeleteReference").hidden=!r;
 $("bcVideoFrameControls").hidden=!canVideoAnalyze(item);
 $("bcCaptureFrame").disabled=!(canVideoAnalyze(item)&&item.type==="asset");
 $("bcAnalyzeVideoFrame").disabled=!canVideoAnalyze(item);
 if(data.videoFrame?.key!==item?.key||data.videoFrame?.seconds!==data.frame){
  $("bcFrameStillPreview").hidden=true;$("bcFrameStillPreview").removeAttribute("src");
 }
 drawPatternMatches(item);
 if(!allowed){text("bcTrainStatus","Only photos and video records can be used as training references.");return}
 const aiResult=ai(item),current=labels(item),videoResult=item?.kind==="video"?videoSuggestion(item)?.analysis:null;
 $("bcTrainWorld").value=r?.world||videoResult?.tags?.find(t=>String(t).startsWith("maf:"))?.slice(4)||current.world;
 $("bcTrainCountry").value=r?.country_code||videoResult?.country_code||current.country;
 $("bcTrainBranch").value=r?.branch||videoResult?.military_branch||current.branch;
 const category=r?.category||videoResult?.military_category||current.category;
 $("bcTrainCategory").value=[...$("bcTrainCategory").options].some(o=>o.value===category)?category:"Unsorted";
 $("bcTrainUniform").value=r?.uniform_name||videoResult?.uniform_type||aiResult?.uniform_type||"";
 $("bcTrainPattern").value=r?.camouflage_pattern||videoResult?.camouflage_pattern||aiResult?.camouflage_pattern||"";
 $("bcTrainEra").value=r?.era||item.era||"";
 $("bcTrainEvidence").value=r?.visual_evidence||videoResult?.notes||aiResult?.notes||"";
 $("bcTrainLookalikeCountry").value=r?.lookalike_country||"";
 $("bcTrainLookalikeBranch").value=r?.lookalike_branch||"";
 $("bcTrainDifferences").value=r?.distinguishing_features||"";
 $("bcTrainTags").value=(r?.tags||videoResult?.tags||aiResult?.tags||item.tags||[]).filter(x=>!String(x).startsWith("maf:")).join(", ");
 data.frame=r?.frame_seconds||data.frame;$("bcTrainTime").value=fmtTime(data.frame);
 $("bcDeleteReference").hidden=!r;
 text("bcReferenceMode",r?r.reference_status.toUpperCase():"NEW REFERENCE");
 text("bcTeachExisting",r?"Reference is "+r.reference_status+". Distinctive evidence: "+(r.visual_evidence||"Not recorded"):"No owner reference saved yet.");
 text("bcTrainStatus",item.adult?"Adult-restricted sources are private drafts only and excluded from external AI prompt memory.":r?.reference_status==="verified"?"Verified reference; you can update the country and visual evidence.":"Review the AI suggestions; Save Draft or Verify & Teach AI. Nothing publishes.");
}
function formPayload(status){
 const item=data.selected;if(!canTeach(item))throw Error("Select eligible media to teach");
 const c=$("bcTrainCountry").value.trim().toUpperCase(),l=$("bcTrainLookalikeCountry").value.trim().toUpperCase();
 if(c&&!/^[A-Z]{2}$/.test(c)||l&&!/^[A-Z]{2}$/.test(l))throw Error("Use ISO two-letter country codes");
 const world=$("bcTrainWorld").value,evidence=$("bcTrainEvidence").value.trim();
 if(status==="verified"&&(world==="unsorted"||evidence.length<15||item.adult||!$("bcTrainConfirmed").checked))
  throw Error("Verify the World, add visible evidence (15+ characters), and confirm the annotation. Restricted media stays draft-only.");
 return {owner_id:data.user.id,source_kind:item.type,source_id:item.id,frame_seconds:item.kind==="video"?secs($("bcTrainTime").value):0,
  world,country_code:c,branch:world==="military"?$("bcTrainBranch").value.trim().slice(0,70)||"Unspecified":"Unspecified",
  category:$("bcTrainCategory").value,uniform_name:$("bcTrainUniform").value.trim().slice(0,160),camouflage_pattern:$("bcTrainPattern").value.trim().slice(0,130),era:$("bcTrainEra").value.trim().slice(0,90),
  visual_evidence:evidence.slice(0,1200),lookalike_country:l,lookalike_branch:$("bcTrainLookalikeBranch").value.trim().slice(0,70),
  distinguishing_features:$("bcTrainDifferences").value.trim().slice(0,1000),
  tags:[...new Set($("bcTrainTags").value.split(",").map(x=>x.trim().slice(0,40)).filter(Boolean))].slice(0,15),
  reference_status:status,updated_at:new Date().toISOString()};
}
async function save(status){
 if(data.saving)return;data.saving=true;
 try{
  const payload=formPayload(status);
  if(status==="verified"&&!confirm("Verify this uniform reference? For a rights-confirmed, non-restricted photograph, BLACKCELL will also check whether all five automatic-publication requirements are met. A 100% verified checklist may publish it; otherwise it remains pending. Videos are not auto-published."))return;
  const r=await db.from("corp_uniform_training_references").upsert(payload,{onConflict:"owner_id,source_kind,source_id,frame_seconds"}).select("*").single();
  if(r.error)throw r.error;
  const i=data.learning.findIndex(x=>x.id===r.data.id);if(i<0)data.learning.unshift(r.data);else data.learning[i]=r.data;
  data.frame=r.data.frame_seconds;render();$("bcDeleteReference").hidden=false;text("bcReferenceMode",status.toUpperCase());
  let publishingNote="";
  if(status==="verified"&&payload.source_kind==="asset"&&data.selected?.kind==="photo"&&data.selected?.status==="pending"){
   try{
    const result=await db.rpc("blackcell_uniform_auto_publish_100",{p_asset_id:payload.source_id});
    if(result.error)throw result.error;
    if(result.data?.approved){
     data.selected.status="approved";
     const row=data.ai.find(x=>x.asset_id===payload.source_id);if(row)row.status="approved";
     publishingNote=" 100/100 verification checks passed: publication approved and filed automatically.";
     render();
    }else if(result.data?.ok){
     publishingNote=" Auto-publish readiness "+Number(result.data.readiness||0)+"/100; remains pending for your publication approval.";
    }
   }catch(err){publishingNote=" Auto-publish check unavailable; photo remains pending. "+String(err.message||err).slice(0,110)}
  }
  const completedMessage=status==="verified"?"Verified reference saved. Future photo AI may consult this evidence."+publishingNote:"Private draft saved. It won't affect AI until verified.";
  if(status==="verified"&&data.page==="teach"&&flowStage(data.selected)!=="teach"){
   const nextStage=flowStage(data.selected);
   selectNextTechItem();fillForm();render();
   text("bcTechQueueStatus","Verified reference moved to "+(nextStage==="completed"?"Completed Inventory":"Review & Approve")+". Tech AI now shows the next unfinished record.");
  }else text("bcTrainStatus",completedMessage);
 }catch(err){text("bcTrainStatus","Save failed: "+String(err.message||err).slice(0,200))}
 finally{data.saving=false}
}
async function removeRef(){
 const item=data.selected;if(!item)return;
 let frame;try{frame=item.kind==="video"?secs($("bcTrainTime").value):0}catch(err){text("bcTrainStatus",err.message);return}
 const r=ref(item,frame);if(!r||!confirm("Remove the training reference? Source media remains untouched."))return;
 const result=await db.from("corp_uniform_training_references").delete().eq("id",r.id).eq("owner_id",data.user.id);
 if(result.error){text("bcTrainStatus",result.error.message);return}
 data.learning=data.learning.filter(x=>x.id!==r.id);render();fillForm();text("bcTrainStatus","Reference removed; media unchanged.");
}
async function analyze(){
 const item=data.selected;if(!item||item.type!=="asset"||item.kind!=="photo"||item.owner!==data.user.id||item.adult)return;
 if(!confirm("Send this privately stored photo to an external AI provider for uniform and top-three camouflage suggestions? This uses API credits; nothing is published."+(data.page==="teach"?" Any unsaved form values will be refreshed by the result.":"")))return;
 const button=$("bcAnalyzeSelected");if(button)button.disabled=true;
 try{
  const r=await db.functions.invoke("blackcell-military-ai",{body:{action:"analyze",asset_id:item.id}});
  if(r.error){let detail=r.error.message;try{const body=await r.error.context?.json?.();detail=body?.error||detail}catch{}throw Error(detail)}
  if(!r.data?.analysis)throw Error(r.data?.error||"AI returned no classification");
  const i=data.ai.findIndex(x=>x.asset_id===item.id);
  if(i<0)data.ai.push(r.data.analysis);else data.ai[i]=r.data.analysis;
  let approvalText="AI suggestions loaded. Review and correct visible evidence before saving as a verified example.";
  if(item.status==="pending"){
   try{
    const gate=await db.rpc("blackcell_uniform_auto_publish_100",{p_asset_id:item.id});
    if(gate.error)throw gate.error;
    if(gate.data?.approved){
     item.status="approved";
     const row=data.ai.find(x=>x.asset_id===item.id);if(row)row.status="approved";
     approvalText="All five verification checks passed (100/100). Photo automatically published to its approved album.";
    }else if(gate.data?.ok)approvalText="AI analyzed privately; publication checklist "+Number(gate.data.readiness||0)+"/100. Approval remains yours until 100/100. AI confidence alone is not proof.";
   }catch(error){approvalText="AI suggestions saved. Auto-publication check unavailable; photo remains pending: "+String(error.message||error).slice(0,115)}
  }
  const nextStage=flowStage(item);
  if(nextStage==="completed"){
   switchTab("completed");render();
   text("bcCatalogMeta",approvalText);
  }else if(nextStage==="review"){
   switchTab("review");render();
   text("bcProcessStatus",approvalText);
  }else{
   switchTab("teach",true);render();text("bcTrainStatus",approvalText);
  }
 }catch(err){alert("AI classification unavailable: "+String(err.message||err).slice(0,200))}
 finally{if(button)button.disabled=false}
}
async function boot(){
 try{
  const a=await corporateAuthorize(db);if(!a.ok||!a.user||!["owner","employee"].includes(a.member?.role))throw Error("Corporate authorization required");
  const c=await db.rpc(a.member.role==="owner"?"corp_code_status":"corp_employee_code_status");
  if(c.error||c.data?.ok!==true||c.data?.verified!==true)throw Error("Corporate access verification is required");
  data.user=a.user;data.owner=a.member.role==="owner"&&Number(a.member.clearance_level)===7;
  $("bcGate").hidden=true;$("bcApp").hidden=false;$("bcConnection").dataset.ready="true";text("bcConnection",data.owner?"LEVEL 7 VERIFIED":"VERIFIED MEMBER");
  if(!data.owner){for(const n of document.querySelectorAll(".bc-tab"))if(n.dataset.tab!=="uploads")n.hidden=true;switchTab("uploads");return}
  gunnerCommand=initGunnerCommand({client:db,userId:a.user.id});
  visualMemory=mountBlackcellVisualMemory({
   client:db,getUser:()=>data.owner?data.user?.id:null,getItems:()=>data.items,
   onChoose:item=>{select(item);const stage=flowStage(item);switchTab(stage==="completed"?"completed":stage==="catalog"?"catalog":"teach",true)}
  });
  uniformSemantic=mountBlackcellUniformSemantic({
   client:db,
   getUser:()=>data.owner?data.user?.id:null,
   getItems:()=>data.items,
   getReadyIds:()=>new Set([
    ...data.ai.map(x=>x.asset_id),
    ...data.learning.filter(r=>r.source_kind==="asset"&&r.reference_status==="verified").map(r=>r.source_id)
   ]),
   onChoose:item=>{select(item);const stage=flowStage(item);switchTab(stage==="completed"?"completed":stage==="catalog"?"catalog":"teach",true)}
  });
  startAutopilot();
  switchTab(location.hash==="#review"?"review":"catalog");await Promise.all([loadCatalog(true),loadMemory().catch(err=>text("bcCatalogMeta","Reference memory unavailable: "+err.message))]);
 }catch(err){$("bcApp").hidden=true;$("bcGate").hidden=false;text("bcGateMessage",err.message||"Access restricted");text("bcConnection","ACCESS REQUIRED")}
}
function init(){
 window.addEventListener("message",receiveAutopilot);
 $("bcAutopilotSwitch").onclick=()=>postAutopilotCommand(data.autopilot?.enabled?"pause":"enable");
 $("bcAutopilotRun").onclick=()=>postAutopilotCommand("run");
 for(const b of document.querySelectorAll(".bc-tab"))b.onclick=()=>switchTab(b.dataset.tab);
 for(const id of ["bcSearch","bcFilterKind","bcFilterStatus","bcFilterWorld","bcFilterSource"])$(id).addEventListener(id==="bcSearch"?"input":"change",list);
 $("bcRefreshAll").onclick=()=>{if(data.owner){postAutopilotCommand("refresh");void Promise.all([loadCatalog(true),loadMemory(),...(publicationReview?[publicationReview.refresh()]:[]),...(gunnerCommand?[gunnerCommand.refresh()]:[])])}};
 $("bcLoadMore").onclick=()=>void loadCatalog();
 $("bcTeachSelected").onclick=()=>{data.frame=0;switchTab("teach",true)};
 $("bcOpenAdmin").onclick=()=>switchTab("review");
 $("bcReviewBackToCatalog").onclick=()=>switchTab("catalog");
 const aiButton=$("bcAnalyzeSelected");if(aiButton)aiButton.onclick=()=>void analyze();
 $("bcSuggestPattern").onclick=()=>void analyze();
 $("bcCaptureFrame").onclick=()=>void captureCurrentFrame();
 $("bcFrameStillInput").onchange=()=>void pickVideoStill($("bcFrameStillInput").files?.[0]);
 $("bcAnalyzeVideoFrame").onclick=()=>void analyzeVideoFrame();
 $("bcScanVideoTimeline").onclick=()=>void scanVideoTimeline();
 $("bcSaveDraft").onclick=()=>void save("draft");
 $("bcTrainForm").onsubmit=ev=>{ev.preventDefault();void save("verified")};
 $("bcDeleteReference").onclick=()=>void removeRef();
 $("bcTrainWorld").onchange=()=>{if($("bcTrainWorld").value!=="military")$("bcTrainBranch").value="Unspecified"};
 $("bcTrainTime").onchange=()=>{if(data.selected?.kind==="video"){
  try{
   const seconds=secs($("bcTrainTime").value);if(seconds>86400)throw Error("Frame timestamp exceeds 24 hours.");
   data.frame=seconds;data.videoFrame=null;$("bcFrameStillPreview").hidden=true;
   const player=$("bcTeachPreview").querySelector("video");
   if(player&&Number.isFinite(player.duration)&&seconds<player.duration){player.currentTime=seconds;player.pause()}
   fillForm(ref(data.selected,seconds));text("bcFrameStatus","Frame "+fmtTime(seconds)+" selected. Capture it or choose a matching still image.");
  }catch(err){text("bcFrameStatus",err.message)}
 }};
 window.addEventListener("pagehide",clearPreview);
 const names="US GB CA AU NZ FR DE NL PL UA RU CN TW JP KR SG IN ID PH TH VN TR IL SE FI NO DK CH AT BE IT ES PT GR CZ RO RS BR AR ZA EG PK AE SA MX".split(" ");
 for(const code of names){const option=document.createElement("option");option.value=code;option.label=country(code);$("bcCountryOptions").append(option)}
 const namesUsed=new Set();
 for(const pattern of PATTERNS)if(!namesUsed.has(pattern.name)){namesUsed.add(pattern.name);const opt=document.createElement("option");opt.value=pattern.name;$("bcPatternOptions").append(opt)}
 for(const origin of [...new Set(PATTERNS.map(p=>p.origin))].sort()){const opt=document.createElement("option");opt.value=origin;opt.textContent=origin==="multiple"?"Multinational":country(origin);$("bcPatternCountry").append(opt)}
 $("bcPatternSearch").addEventListener("input",drawPatterns);
 $("bcPatternCountry").addEventListener("change",drawPatterns);
 void boot();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
