/* BLACKCELL Uniform Intelligence Center | owner-only catalog and learning */
import {corporateClient,corporateAuthorize} from "./corp-auth.js?v=20261114-transport-classification";
import {PATTERNS,SOURCES as CAMO_SOURCES,EXTERNAL_SAMPLES,COUNTRY_COMPARISON_LESSONS} from "./blackcell-camouflage-atlas.js?v=20261117-r3";
const db=corporateClient();
const $=id=>document.getElementById(id), E=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n;};
const W={military:"Military",police:"Law Enforcement",fire:"Fire & Rescue",medical:"Medical",security:"Corrections / Security",professional:"Aviation / Professional",unsorted:"Unsorted"};
const SOURCES=[
 ["asset","corp_social_assets","created_at","id,owner_id,kind,purpose,filename,created_at,caption,military_category,military_branch,military_country_code,military_era,military_tags,review_status,adult_restricted,source_provider,storage_path,bytes"],
 ["stream_video","corp_stream_videos","created_at","id,owner_id,title,filename,created_at,review_status,video_category,video_synopsis,adult_restricted,bytes"],
 ["post","corp_social_posts","created_at","id,author_id,body,kind,created_at"],
 ["saved","corp_social_tiktok_saves","saved_at","id,user_id,title,military_branch,creator_handle,saved_at"]
];
const data={user:null,owner:false,items:[],learning:[],ai:[],page:"catalog",selected:null,frame:0,blob:"",previewGeneration:0,loading:false,saving:false};
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
function switchTab(page){
 if(!data.owner&&page!=="uploads")return;
 data.page=page;
 for(const b of document.querySelectorAll(".bc-tab"))b.setAttribute("aria-selected",String(b.dataset.tab===page));
 for(const n of ["catalog","teach","atlas","uploads"])$("bcPage"+n[0].toUpperCase()+n.slice(1)).hidden=n!==page;
 if(page==="teach")fillForm();
 if(page==="atlas"){drawAtlas();drawPatterns()}
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
  render();
 }finally{data.loading=false;$("bcRefreshAll").disabled=false}
}
async function loadMemory(){
 if(!data.owner)return;
 const [r,a]=await Promise.all([
  db.from("corp_uniform_training_references").select("*").eq("owner_id",data.user.id).order("updated_at",{ascending:false}).limit(1000),
  db.from("corp_social_ai_analysis").select("asset_id,status,country_code,military_branch,military_category,uniform_type,confidence,tags,notes").eq("owner_id",data.user.id).limit(1000)
 ]);
 if(r.error)throw Error(r.error.message);
 data.learning=r.data||[];data.ai=a.data||[];
 if(a.error)text("bcCatalogMeta","AI analysis source unavailable: "+a.error.message);
 render();
}
function stats(){
 const items=data.items,confirmed=data.learning.filter(x=>x.reference_status==="verified");
 for(const [key,value] of [["bcTotal",items.length],["bcPhotos",items.filter(x=>x.kind==="photo").length],
 ["bcVideos",items.filter(x=>x.kind==="video").length],["bcPending",items.filter(x=>x.status==="pending").length],
 ["bcTrained",confirmed.length],["bcCountriesCount",new Set(confirmed.map(x=>x.country_code).filter(Boolean)).size]])text(key,value);
 const extra=index.some(x=>!x.done&&!x.error),failed=index.filter(x=>x.error);
 $("bcLoadMore").hidden=!extra;
 text("bcPagingStatus",items.length+" records indexed"+(extra?" · more available":""));
 text("bcCatalogScope",failed.length?"PARTIAL · "+failed.length+" UNAVAILABLE":"LIVE PRIVATE CATALOG");
 text("bcCatalogMeta",failed.length?failed.map(x=>x.table+": "+x.error).join(" | ").slice(0,170):"Four site catalog sources connected");
}
function match(item){
 const lab=labels(item),q=$("bcSearch").value.toLowerCase().trim();
 if($("bcFilterKind").value!=="all"&&$("bcFilterKind").value!==item.kind)return false;
 if($("bcFilterStatus").value!=="all"&&$("bcFilterStatus").value!==item.status)return false;
 if($("bcFilterWorld").value!=="all"&&$("bcFilterWorld").value!==lab.world)return false;
 if($("bcFilterSource").value!=="all"&&$("bcFilterSource").value!==item.source)return false;
 return !q||[item.title,item.desc,item.status,item.source,item.category,lab.country,country(lab.country),lab.branch,lab.uniform,...item.tags].join(" ").toLowerCase().includes(q);
}
function list(){
 const h=$("bcInventory");h.replaceChildren();
 const items=data.items.filter(match).sort((a,b)=>Date.parse(b.date||0)-Date.parse(a.date||0));
 text("bcResultCount"," · "+items.length);
 for(const item of items){
  const v=labels(item),b=E("button","bc-list-row"),ico=E("span","bc-list-icon",item.kind==="photo"?"▧":item.kind==="video"?"▷":"≡"),name=E("span","bc-list-main"),chips=E("span","bc-list-tags");
  b.type="button";b.dataset.itemKey=item.key;b.setAttribute("role","option");b.setAttribute("aria-selected",String(item.key===data.selected?.key));
  ico.dataset.kind=item.kind;
  name.append(E("strong","",item.title),E("small","",[item.source.toUpperCase(),W[v.world],v.country||"COUNTRY UNKNOWN",v.branch!=="Unspecified"?v.branch:""].filter(Boolean).join(" · ")));
  const status=E("span","bc-pill",item.status);status.dataset.status=item.status;chips.append(status);
  const r=ref(item);if(r){const c=E("span","bc-pill",r.reference_status.toUpperCase());c.dataset.status=r.reference_status;chips.append(c)}
  b.append(ico,name,chips);b.onclick=()=>select(item);h.append(b);
 }
 if(!items.length)h.append(E("p","bc-empty","No accessible records match these filters."));
 if(!data.selected&&items[0])select(items[0]);
}
function clearPreview(){
 ++data.previewGeneration;
 if(data.blob){URL.revokeObjectURL(data.blob);data.blob=""}
 for(const id of ["bcPreview","bcTeachPreview"]){const target=$(id);for(const v of target.querySelectorAll("video")){v.pause();v.removeAttribute("src");v.load()}target.replaceChildren()}
}
function placeholder(s){
 for(const id of ["bcPreview","bcTeachPreview"]){const box=E("div","bc-preview-empty");box.append(E("span","","▧"),E("b","",s));$(id).replaceChildren(box)}
}
async function preview(item){
 clearPreview();const seq=data.previewGeneration;
 if(item.type!=="asset"){placeholder(item.kind==="video"?"Video record indexed; open BLACKCELL Tube for playback":"Catalog record has no attached media");return}
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
   const node=document.createElement(item.kind==="video"?"video":"img");node.src=url;
   if(item.kind==="video"){node.controls=true;node.preload="metadata";node.playsInline=true}else node.alt="Protected BLACKCELL image";
   $(id).replaceChildren(node);
  }
 }catch(err){if(seq===data.previewGeneration)placeholder("Preview unavailable · "+String(err.message||err).slice(0,100))}
}
function fact(label,value){const box=E("div","bc-fact");box.append(E("small","",label),E("b","",value||"—"));return box}
function select(item){
 data.selected=item;data.frame=0;
 for(const n of $("bcInventory").querySelectorAll("[data-item-key]"))n.setAttribute("aria-selected",String(n.dataset.itemKey===item.key));
 const v=labels(item);
 text("bcSelectionStatus",item.kind.toUpperCase());text("bcItemTitle",item.title);
 text("bcItemSource",item.source.toUpperCase()+" · "+item.status);
 $("bcItemFacts").replaceChildren(fact("UNIFORM WORLD",W[v.world]),fact("COUNTRY",country(v.country)),fact("BRANCH",v.branch),
 fact("CATEGORY",v.category),fact("UNIFORM",v.uniform||"Unidentified"),fact("REFERENCE",v.memory),
 fact("AI CONFIDENCE",v.confidence),fact("ERA",item.era||"Unknown"),fact("FILE SIZE",item.size?(item.size/1048576).toFixed(1)+" MB":"N/A"));
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
function render(){stats();list();drawAtlas();drawPatterns()}
function formBlank(){
 for(const id of ["bcTrainCountry","bcTrainUniform","bcTrainPattern","bcTrainEra","bcTrainEvidence","bcTrainLookalikeCountry","bcTrainLookalikeBranch","bcTrainDifferences","bcTrainTags"])$(id).value="";
 $("bcTrainWorld").value="unsorted";$("bcTrainBranch").value="Unspecified";$("bcTrainCategory").value="Unsorted";$("bcTrainTime").value="00:00";$("bcTrainConfirmed").checked=false;
}
function fillForm(exact){
 const item=data.selected;formBlank();text("bcTeachTitle",item?.title||"No media selected");
 text("bcTeachSourceHint",item?[item.source,item.kind,item.status].join(" · "):"Select a photo or video in the inventory");
 const allowed=canTeach(item),r=exact||ref(item,data.frame)||ref(item,0);
 $("bcSaveDraft").disabled=!allowed;$("bcVerifyReference").disabled=!allowed||!!item?.adult;
 $("bcTrainTime").disabled=!allowed||item?.kind!=="video";$("bcDeleteReference").hidden=!r;
 if(!allowed){text("bcTrainStatus","Only photos and video records can be used as training references.");return}
 const aiResult=ai(item),current=labels(item);
 $("bcTrainWorld").value=r?.world||current.world;
 $("bcTrainCountry").value=r?.country_code||current.country;
 $("bcTrainBranch").value=r?.branch||current.branch;
 const category=r?.category||current.category;
 $("bcTrainCategory").value=[...$("bcTrainCategory").options].some(o=>o.value===category)?category:"Unsorted";
 $("bcTrainUniform").value=r?.uniform_name||aiResult?.uniform_type||"";
 $("bcTrainPattern").value=r?.camouflage_pattern||"";
 $("bcTrainEra").value=r?.era||item.era||"";
 $("bcTrainEvidence").value=r?.visual_evidence||aiResult?.notes||"";
 $("bcTrainLookalikeCountry").value=r?.lookalike_country||"";
 $("bcTrainLookalikeBranch").value=r?.lookalike_branch||"";
 $("bcTrainDifferences").value=r?.distinguishing_features||"";
 $("bcTrainTags").value=(r?.tags||aiResult?.tags||item.tags||[]).filter(x=>!String(x).startsWith("maf:")).join(", ");
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
  if(status==="verified"&&!confirm("Verify this evidence-based uniform reference for BLACKCELL AI? Your original photo or video stays private and publication status will NOT change."))return;
  const r=await db.from("corp_uniform_training_references").upsert(payload,{onConflict:"owner_id,source_kind,source_id,frame_seconds"}).select("*").single();
  if(r.error)throw r.error;
  const i=data.learning.findIndex(x=>x.id===r.data.id);if(i<0)data.learning.unshift(r.data);else data.learning[i]=r.data;
  data.frame=r.data.frame_seconds;render();$("bcDeleteReference").hidden=false;text("bcReferenceMode",status.toUpperCase());
  text("bcTrainStatus",status==="verified"?"Verified reference saved. Future photo AI may consult this evidence. Nothing was published.":"Private draft saved. It won't affect AI until verified.");
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
 if(!confirm("Send a private photo to an external AI provider for uniform suggestions? This may use API credits; the photo will not be published."))return;
 const button=$("bcAnalyzeSelected");if(button)button.disabled=true;
 try{
  const r=await db.functions.invoke("blackcell-military-ai",{body:{action:"analyze",asset_id:item.id}});
  if(r.error){let detail=r.error.message;try{const body=await r.error.context?.json?.();detail=body?.error||detail}catch{}throw Error(detail)}
  if(!r.data?.analysis)throw Error(r.data?.error||"AI returned no classification");
  const i=data.ai.findIndex(x=>x.asset_id===item.id);
  if(i<0)data.ai.push(r.data.analysis);else data.ai[i]=r.data.analysis;
  render();switchTab("teach");text("bcTrainStatus","AI suggestions loaded. Review and correct visible evidence before saving as a verified example.");
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
  switchTab("catalog");await Promise.all([loadCatalog(true),loadMemory().catch(err=>text("bcCatalogMeta","Reference memory unavailable: "+err.message))]);
 }catch(err){$("bcApp").hidden=true;$("bcGate").hidden=false;text("bcGateMessage",err.message||"Access restricted");text("bcConnection","ACCESS REQUIRED")}
}
function init(){
 for(const b of document.querySelectorAll(".bc-tab"))b.onclick=()=>switchTab(b.dataset.tab);
 for(const id of ["bcSearch","bcFilterKind","bcFilterStatus","bcFilterWorld","bcFilterSource"])$(id).addEventListener(id==="bcSearch"?"input":"change",list);
 $("bcRefreshAll").onclick=()=>{if(data.owner)void Promise.all([loadCatalog(true),loadMemory()])};
 $("bcLoadMore").onclick=()=>void loadCatalog();
 $("bcTeachSelected").onclick=()=>{data.frame=0;switchTab("teach")};
 $("bcOpenAdmin").onclick=()=>{location.href="corporate-media-admin.html"};
 const aiButton=$("bcAnalyzeSelected");if(aiButton)aiButton.onclick=()=>void analyze();
 $("bcSaveDraft").onclick=()=>void save("draft");
 $("bcTrainForm").onsubmit=ev=>{ev.preventDefault();void save("verified")};
 $("bcDeleteReference").onclick=()=>void removeRef();
 $("bcTrainWorld").onchange=()=>{if($("bcTrainWorld").value!=="military")$("bcTrainBranch").value="Unspecified"};
 $("bcTrainTime").onchange=()=>{if(data.selected?.kind==="video"){try{data.frame=secs($("bcTrainTime").value);fillForm(ref(data.selected,data.frame))}catch(err){text("bcTrainStatus",err.message)}}};
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
