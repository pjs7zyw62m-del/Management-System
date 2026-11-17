/* BLACKCELL // THE HUNT. Verified, read-only owner mission dashboard.
 * Reuses existing Gunner mission and quota logic; no model calls or media writes. */
import {corporateClient,corporateAuthorize} from "./corp-auth.js?v=20261114-transport-classification";
import {planGunnerProduction} from "./blackcell-gunner-production.js?v=20261117-pulse-r1";
import {createMissions} from "./blackcell-gunner-command.js?v=20261117-hunt-v1";
import {chooseHuntGoal,makeDiscoveryChain,makeCollectorRank,makeLivingAtlas,recommendPhotoPace,HUNT_MODES,getHuntSourceQuery} from "./blackcell-the-hunt-engine.js?v=20261117-scout-r1";
import {mountMilitaryGunner} from "./military-gunner.js?v=20261117-journal-r1";
const client=corporateClient();
const $=id=>document.getElementById(id);
const num=v=>Math.max(0,Math.round(Number(v)||0));
const fmt=v=>num(v).toLocaleString("en-US");
const set=(id,value)=>{$(id).textContent=String(value)};
const make=(tag,cls,value)=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(value!==undefined)node.textContent=String(value);
 return node;
};
const state={user:null,snapshot:null,pulse:null,plan:null,goals:[],missions:[],busy:false,day:null,lastFetch:0,mode:"focused",goalId:"",verifiedMatchCount:null,verifySeq:0,scoutItems:[],scoutBusy:false,scoutLastQuery:"",scoutLastRun:0,companion:null};
const day=()=>new Date().toLocaleDateString("en-CA",{timeZone:"America/Los_Angeles"});
function fail(message){
 $("huntApp").hidden=true;$("huntGate").hidden=false;
 set("huntGateMessage","Access restricted: "+String(message||"Verification unavailable").slice(0,220));
 $("huntGateRetry").hidden=false;
}
function focusGroups(stats){
 const b=Array.isArray(stats.branches)?stats.branches:[];
 const w=Array.isArray(stats.worlds)?stats.worlds:[];
 const byBranch=test=>b.reduce((total,item)=>total+(test.test(String(item.branch||""))?num(item.count):0),0);
 return [
  {label:"ARMY",count:byBranch(/\barmy\b/i)},
  {label:"MARINES",count:byBranch(/marine/i)},
  {label:"LAW ENFORCEMENT",count:num(w.find(x=>x.world==="police")?.count)}
 ];
}
function paintFocus(stats){
 const root=$("huntFocus");root.replaceChildren();
 const groups=focusGroups(stats);
 const max=Math.max(1,...groups.map(x=>x.count));
 for(const group of groups){
  const card=make("div","focus-item");
  const head=make("div","focus-top");
  head.append(make("strong","",group.label),make("small","",fmt(group.count)));
  const track=make("div","focus-track"),fill=make("span","");
  fill.style.width=Math.round(100*group.count/max)+"%";
  track.append(fill);card.append(head,track);root.append(card);
 }
}
function renderQuotas(){
 const p=state.plan,m=state.snapshot?.media||{};
 set("huntPending",fmt(m.pending));
 if(!p){
  for(const id of ["huntTarget","huntTodayPhotos","huntVideoTarget","huntCatchup"])set(id,"—");
  set("huntPhotoStatus","Production history is not available");
  set("huntVideoStatus","No verified weekly calculation");
  set("huntCatchupStatus","No missed-day claim without historical data");
  set("huntProgressText","History unavailable");
  set("huntPacingNote","Upload counts are not billing records. No spending or publication is authorized.");
  $("huntProgressFill").style.width="0%";
  set("missionDate","BASELINE UNAVAILABLE");
  return;
 }
 const photos=p.photo,videos=p.video;
 set("huntTodayPhotos",fmt(p.photoToday));
 const pace=recommendPhotoPace(p,state.mode);
 set("huntTarget",pace.ready?fmt(pace.target):"—");
 set("missionDate",photos.ready?"LIVE OWNER ACTIVITY · "+(state.pulse?.timezone||"ACCOUNT TIME"):"WAITING FOR 7+ COMPLETED DAYS");
 set("huntPhotoStatus",pace.ready?"Mode-adjusted, optional daily target: "+fmt(pace.target):pace.reason);
 set("huntVideoTarget",videos.ready?fmt(videos.weekly)+" / WK":"—");
 set("huntVideoStatus",videos.ready?"Uploaded this week: "+fmt(p.videoThisWeek)+". "+videos.reason:videos.reason);
 set("huntCatchup",photos.ready?fmt(photos.carryover):"—");
 set("huntCatchupStatus",photos.ready?
  (photos.missedYesterday?"Yesterday had zero photo uploads. ":"No missed-day penalty for today. ")+
  (photos.carryover?"Suggested catch-up photos: "+fmt(photos.carryover)+". ":"No photo carryover. ")+
  (photos.pausedByBacklog?"Review backlog is high. ":""):
  "A reliable baseline is not available yet.");
 const label=pace.ready?fmt(p.photoToday)+" / "+fmt(pace.target)+" uploaded":"No active daily target";
 set("huntProgressText",label);
 $("huntProgressFill").style.width=pace.ready?Math.min(100,Math.round(p.photoToday/Math.max(1,pace.target)*100))+"%":"0%";
 set("huntPacingNote",pace.reason+" "+p.method+" "+p.warning);
}
function renderBrief(){
 const current=state.missions[0],m=state.snapshot?.media||{},p=state.plan;
 let phrase="Your collection has no urgent metadata gaps. Set a private target to choose your next category.";
 if(num(m.pending)>0)phrase="You have "+fmt(m.pending)+" pending records. Clear the verification queue before adding pressure to the catalog.";
 else if(p?.photo?.ready&&p.photo.missedYesterday&&p.photo.carryover>0)
  phrase="Yesterday had no photo uploads. Today's suggested target is "+fmt(p.photo.daily)+"; catch-up is optional and adapts to the review backlog.";
 else if(current)phrase=current.title+". "+current.value+". Start with verified, nonduplicate uniform examples.";
 set("huntBrief","“"+phrase+"”");
 $("huntOpenMission").disabled=!current;
}
function openMission(index){
 const item=state.missions[index];
 if(!item)return;
 set("huntDetailTitle",item.title);
 set("huntDetailReason",item.reason);
 set("huntDetailValue",item.value+" · PRIORITY "+item.score+"/100");
 set("huntDetailAction",item.action);
 $("huntMissionDetails").hidden=false;
 $("huntMissionDetails").scrollIntoView({behavior:"smooth",block:"nearest"});
}
function renderMissions(){
 const root=$("huntMissions");root.replaceChildren();
 for(const [i,item] of state.missions.slice(0,6).entries()){
  const card=make("article","hunt-card log-card");
  card.append(make("small","",String(i+1).padStart(2,"0")+" / PRIORITY "+item.score+"/100"),
   make("h3","",item.title),make("p","",item.reason+" "+item.value));
  const button=make("button","","OPEN MISSION ↗");
  button.type="button";button.addEventListener("click",()=>openMission(i));
  card.append(button);root.append(card);
 }
}
function renderSignals(){
 const s=state.snapshot||{},t=s.interest||{},r=s.references||{},d=s.duplicates||{};
 const metrics=[
  ["FAVORITES",t.favorites,"Explicit positive signals"],
  ["RATINGS",t.rated,"Owner-submitted feedback"],
  ["VERIFIED REFERENCES",r.verified,"Verified teaching examples"],
  ["DUPLICATE CANDIDATES",d.extra_copies,"Inspect before removal"]
 ];
 const root=$("huntSignals");root.replaceChildren();
 for(const [label,count,description] of metrics){
  const card=make("article","hunt-card signal");
  card.append(make("span","",label),make("strong","",fmt(count)),make("small","",description));
  root.append(card);
 }
}

/* Hunt 2.0 rewards verified references, not unverified upload volume. */

/* Public-source discovery: opt-in, foreground-only, rate bounded, and read-only. */
const SCOUT_COOLDOWN=30*60*1000;
const validUrl=(raw,hosts)=>{
 try{const u=new URL(raw);return u.protocol==="https:"&&hosts.some(h=>u.hostname===h||u.hostname.endsWith("."+h))?u.href:null}catch{return null}
};
function sourcePhrase(){
 const goal=currentGoal();
 return getHuntSourceQuery(goal).slice(0,110);
}
function syncSourcePhrase(force=false){
 const input=$("huntScoutQuery");
 if(force||!input.value.trim()||input.dataset.generated==="yes"){
  input.value=sourcePhrase();
  input.dataset.generated="yes";
 }
}
function setScoutState(message,status=""){
 set("huntScoutStatus",message);
 $("huntScoutStatus").dataset.state=status;
}
function renderSources(){
 const root=$("huntScoutResults");root.replaceChildren();
 const records=state.scoutItems;
 if(!records.length)return;
 for(const item of records){
  const page=validUrl(item.source_url,["commons.wikimedia.org"]);
  const preview=validUrl(item.thumbnail_url,["wikimedia.org","wikipedia.org"]);
  if(!page||!preview)continue;
  const card=make("article","scout-result");
  const img=make("img","");
  img.src=preview;img.alt="Public archive candidate: "+String(item.title||"Image").slice(0,100);
  img.loading="lazy";img.referrerPolicy="no-referrer";
  const body=make("div","scout-result-body");
  body.append(make("strong","",String(item.title||"Untitled public archive file").slice(0,160)),
   make("p","","Reported license: "+String(item.license||"Unverified").slice(0,90)),
   make("small","","Credit: "+String(item.author||"See source page").slice(0,120)));
  const links=make("div","scout-links"),open=make("a","","REVIEW FILE ↗");
  open.href=page;open.target="_blank";open.rel="noopener noreferrer";
  links.append(open);
  const license=validUrl(item.license_url,["creativecommons.org","wikimedia.org"]);
  if(license){const a=make("a","","LICENSE ↗");a.href=license;a.target="_blank";a.rel="noopener noreferrer";links.append(a)}
  body.append(links);card.append(img,body);root.append(card);
 }
}
async function scout({automatic=false}={}){
 if(state.scoutBusy||!state.user||document.hidden)return;
 if(automatic&&(!$("huntScoutAuto").checked||state.mode==="paused"))return;
 const now=Date.now(),query=$("huntScoutQuery").value.replace(/\s+/g," ").trim().slice(0,110);
 if(query.length<3){setScoutState("Enter at least three public research characters.","error");return}
 if(automatic&&state.scoutLastQuery===query&&now-state.scoutLastRun<SCOUT_COOLDOWN)return;
 state.scoutBusy=true;$("huntScoutSearch").disabled=true;
 setScoutState("Searching public Wikimedia Commons file metadata…");
 try{
  const {data,error}=await client.functions.invoke("blackcell-hunt-scout",{body:{query}});
  if(error){
   let message=error.message||"Scout request failed";
   try{const body=await error.context?.json?.();message=body?.error||message}catch{}
   throw Error(message)
  }
  if(!data?.ok||!Array.isArray(data.results))throw Error(data?.error||"Source Scout returned no valid results");
  state.scoutItems=data.results.slice(0,8);
  state.scoutLastQuery=query;state.scoutLastRun=Date.now();
  renderSources();
  setScoutState(state.scoutItems.length?
    state.scoutItems.length+" external candidate file"+(state.scoutItems.length===1?"":"s")+
    " located. Review source, license, attribution, and rights individually. Nothing was imported.":
    "No licensed metadata candidates found for this query. Try a broader uniform or era.",state.scoutItems.length?"success":"");
 }catch(error){
  state.scoutItems=[];renderSources();
  setScoutState("Source Scout unavailable: "+String(error?.message||error).slice(0,220),"error");
 }finally{state.scoutBusy=false;$("huntScoutSearch").disabled=false}
}
function sourceAutopilotSetting(){
 try{return localStorage.getItem("bc_hunt_scout_v1_"+state.user.id)==="on"}catch{return false}
}
function saveSourceAutopilot(on){
 try{localStorage.setItem("bc_hunt_scout_v1_"+state.user.id,on?"on":"off")}catch{}
}
function initializeGunnerCompanion(){
 if(state.companion)return;
 state.companion=mountMilitaryGunner({client,mount:document.body,visible:false,
  getContext:()=>({
   page_title:"BLACKCELL THE HUNT / Source Scout / Discovery Chains",
   collection_mode:true,
   countries:(state.snapshot?.countries||[]).slice(0,10).map(x=>x.code).filter(x=>/^[A-Z]{2}$/.test(String(x)))
  })
 });
}
function briefGunner(aboutSources=false){
 if(!state.companion)return;
 const goal=currentGoal(),plan=state.plan;
 const active=goal?"Current operation "+goal.dimension+" "+goal.value+
  ", target "+num(goal.target_count)+" records. ":"No saved collection goal yet. ";
 const quota=plan?.photo?.ready?"Today's optional photo target "+num(plan.photo.daily)+
  ", uploaded today "+num(plan.photoToday)+", pending approval "+num(plan.pending)+". ":"Upload baseline unavailable. ";
 const results=aboutSources&&state.scoutItems.length?
  " Commons source candidates (unverified license and identity): "+
  state.scoutItems.slice(0,3).map(x=>x.title+" ["+x.license+"]").join("; ")+". ":"";
 const question=aboutSources?
  "Gunner, prioritize what to investigate from these public archive candidates. Do not claim to have inspected pixels or verified license. ":
  "Gunner, give me your strongest next collection mission based on these numbers. Only suggest lawful, verified source research. ";
 state.companion.setPrompt((question+active+quota+results+
  "I will approve any import, publication or spending.").slice(0,1600));
}

function buildRank(){
 const rank=makeCollectorRank(state.snapshot);
 set("huntRank","LVL "+rank.level);
 set("huntRankTitle",rank.title);
 set("huntXp",fmt(rank.points)+" research points · "+fmt(rank.verified)+" verified references");
 set("huntRankProgressText",rank.progress+" / "+rank.perRank+" toward next rank");
 set("huntRankRemaining",rank.needed+" to next");
 $("huntRankProgress").style.width=rank.percent+"%";
}
function buildAtlas(){
 const a=makeLivingAtlas(state.snapshot),root=$("huntAtlas");
 root.replaceChildren();
 set("huntAtlasCoverage",a.worldsRepresented+" / 6 LABELED WORLDS");
 const largest=Math.max(1,...a.worlds.map(w=>w.count));
 for(const world of a.worlds){
  const card=make("article","hunt-card atlas-world"),head=make("div","atlas-world-head");
  head.append(make("h3","",world.name),make("strong","",fmt(world.count)));
  const track=make("div","focus-track"),fill=make("span","");
  fill.style.width=Math.round(100*world.count/largest)+"%";track.append(fill);
  card.append(head,track,make("small","",world.count?"Catalog records tagged to this world":"No labeled catalog records"));
  root.append(card);
 }
 for(const [id,items] of [["huntAtlasCountries",a.countries],["huntAtlasBranches",a.branches],["huntAtlasEras",a.eras]]){
  const box=$(id);box.replaceChildren();
  if(!items.length){box.append(make("p","muted","No labels recorded yet."));continue}
  for(const item of items){
   const row=make("div","atlas-tag");
   row.append(make("span","",item.label),make("strong","",fmt(item.count)));
   box.append(row);
  }
 }
}
function buildGoalPicker(){
 const selected=chooseHuntGoal(state.goals,state.goalId),root=$("huntGoalSelect");
 root.replaceChildren();
 const eligible=state.goals.filter(g=>g?.enabled!==false&&["country","world","branch","era"].includes(g?.dimension));
 if(!selected){
  const opt=make("option","","No collection goals yet");opt.value="";root.append(opt);root.disabled=true;
  return null;
 }
 root.disabled=false;
 for(const goal of eligible){
  const option=make("option","",goal.dimension.toUpperCase()+" / "+goal.value+" · target "+fmt(goal.target_count));
  option.value=goal.id;option.selected=goal.id===selected.id;root.append(option);
 }
 return selected;
}
function buildChain(){
 const goal=buildGoalPicker();
 const chain=makeDiscoveryChain(state.snapshot,goal,state.verifiedMatchCount);
 set("huntChainTitle",chain.title);
 set("huntChainStatus",chain.complete?"CAMPAIGN COMPLETE":!goal?"GOAL REQUIRED":"OPERATION ACTIVE");
 $("huntChainStatus").dataset.status=chain.complete?"complete":!goal?"empty":"active";
 const root=$("huntChainSteps");root.replaceChildren();
 for(const [index,stage] of chain.stages.entries()){
  const card=make("li","chain-step");card.dataset.state=stage.status;
  card.append(make("span","chain-stage-num","STAGE "+String(index+1).padStart(2,"0")),
   make("h3","",stage.name),make("p","",stage.detail),
   make("small","",stage.status==="done"?"COMPLETE":stage.status==="active"?"IN PROGRESS":"LOCKED"));
  root.append(card);
 }
}
function currentGoal(){
 return chooseHuntGoal(state.goals,state.goalId);
}
async function loadMatchingVerification(){
 const goal=currentGoal();
 const seq=++state.verifySeq;
 state.verifiedMatchCount=null;
 if(!goal){buildChain();return}
 const col={country:"country_code",branch:"branch",world:"world",era:"era"}[goal.dimension];
 if(!col){buildChain();return}
 try{
  const value=goal.dimension==="country"?String(goal.value).toUpperCase():String(goal.value);
  const result=await client.from("corp_uniform_training_references")
   .select("id",{count:"exact",head:true})
   .eq("owner_id",state.user.id)
   .eq("reference_status","verified").eq(col,value);
  if(seq!==state.verifySeq)return;
  state.verifiedMatchCount=result.error?null:Math.max(0,Number(result.count)||0);
 }catch{if(seq!==state.verifySeq)return;state.verifiedMatchCount=null}
 buildChain();
}
function readMode(){
 try{
  const key="bc_hunt_mode_v2_"+state.user.id;
  const stored=localStorage.getItem(key);
  state.mode=HUNT_MODES.includes(stored)?stored:"focused";
 }catch{state.mode="focused"}
 $("huntMode").value=state.mode;
}
function changeMode(mode){
 if(!HUNT_MODES.includes(mode))return;
 state.mode=mode;$("huntMode").value=mode;
 try{localStorage.setItem("bc_hunt_mode_v2_"+state.user.id,mode)}catch{}
 set("huntModeNote",mode==="paused"?
  "Campaign paused. Your verified references and collection progress stay intact.":
  "Using "+mode.toUpperCase()+" optional target pacing. No forced uploads, penalties, or background spending.");
 $("huntPause").textContent=mode==="paused"?"RESUME CAMPAIGN":"PAUSE CAMPAIGN";
 if(state.snapshot)renderQuotas();
}

function draw(){
 const s=state.snapshot;if(!s)return;
 state.plan=state.pulse?planGunnerProduction(state.pulse,s):null;
 state.missions=createMissions(s,state.goals);
 paintFocus(s);renderQuotas();renderBrief();renderMissions();renderSignals();buildRank();buildAtlas();buildChain();
 const updated=s.generated_at?new Date(s.generated_at).toLocaleString():"now";
 set("huntLastRefresh","UPDATED "+updated);
 set("huntConnection",state.pulse?"LEVEL 7 VERIFIED":"LEVEL 7 · PARTIAL DATA");
 if(!$("huntMissionDetails").hidden)$("huntMissionDetails").hidden=true;
}
async function refresh(){
 if(state.busy||!state.user)return;
 state.busy=true;$("huntRecalculate").disabled=true;
 set("huntConnection","RECALCULATING");
 try{
  const [stats,goals,pulse]=await Promise.all([
   client.rpc("blackcell_gunner_collection_stats"),
   client.from("corp_gunner_collection_goals").select("*").eq("owner_id",state.user.id).order("priority",{ascending:false}).limit(100),
   client.rpc("blackcell_gunner_production_pulse")
  ]);
  if(stats.error||!stats.data?.media)throw Error(stats.error?.message||"No collection statistics returned");
  if(goals.error)throw Error("Private collection goals unavailable: "+goals.error.message);
  state.snapshot=stats.data;state.goals=goals.data||[];
  state.pulse=!pulse.error&&Array.isArray(pulse.data?.daily)?pulse.data:null;
  state.day=day();state.lastFetch=Date.now();draw();syncSourcePhrase();
  await loadMatchingVerification();
  if($("huntScoutAuto").checked)void scout({automatic:true});
 }catch(error){
  set("huntConnection","DATA UNAVAILABLE");
  set("huntLastRefresh","REFRESH FAILED");
  const root=$("huntMissions");root.replaceChildren(make("p","muted","Statistics could not be refreshed: "+String(error.message||error).slice(0,180)));
 }finally{state.busy=false;$("huntRecalculate").disabled=false}
}
async function boot(){
 $("huntGateRetry").hidden=true;
 set("huntGateMessage","Verifying Level 7 corporate access…");
 try{
  const auth=await corporateAuthorize(client);
  if(!auth.ok||!auth.user||auth.member?.role!=="owner"||Number(auth.member?.clearance_level)!==7)throw Error("Level 7 owner authorization is required.");
  const check=await client.rpc("corp_code_status");
  if(check.error||check.data?.ok!==true||check.data?.verified!==true)throw Error("Corporate session verification is required.");
  state.user=auth.user;readMode();changeMode(state.mode);
  $("huntScoutAuto").checked=sourceAutopilotSetting();
  initializeGunnerCompanion();
  $("huntGate").hidden=true;$("huntApp").hidden=false;
  await refresh();
 }catch(error){fail(error.message||error)}
}
$("huntGateRetry").addEventListener("click",()=>void boot());
$("huntRecalculate").addEventListener("click",()=>void refresh());
$("huntOpenMission").addEventListener("click",()=>openMission(0));
$("huntCloseMission").addEventListener("click",()=>{$("huntMissionDetails").hidden=true});
$("huntScoutSearch").addEventListener("click",()=>void scout());
$("huntScoutQuery").addEventListener("input",()=>{$("huntScoutQuery").dataset.generated="no"});
$("huntScoutAuto").addEventListener("change",event=>{
 saveSourceAutopilot(event.target.checked);
 if(event.target.checked&&state.snapshot)void scout({automatic:true});
});
$("huntGunnerBrief").addEventListener("click",()=>briefGunner(false));
$("huntScoutGunner").addEventListener("click",()=>briefGunner(true));
$("huntMode").addEventListener("change",event=>changeMode(event.target.value));
$("huntPause").addEventListener("click",()=>changeMode(state.mode==="paused"?"focused":"paused"));
$("huntGoalSelect").addEventListener("change",()=>{
 state.goalId=$("huntGoalSelect").value;
 state.verifiedMatchCount=null;buildChain();syncSourcePhrase(true);void loadMatchingVerification();
});
document.addEventListener("visibilitychange",()=>{
 if(!document.hidden&&state.user&&(state.day!==day()||Date.now()-state.lastFetch>180000))void refresh();
});
void boot();