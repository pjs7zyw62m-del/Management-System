/* BLACKCELL // THE HUNT. Verified, read-only owner mission dashboard.
 * Reuses existing Gunner mission and quota logic; no model calls or media writes. */
import {corporateClient,corporateAuthorize} from "./corp-auth.js?v=20261114-transport-classification";
import {planGunnerProduction} from "./blackcell-gunner-production.js?v=20261117-pulse-r1";
import {createMissions} from "./blackcell-gunner-command.js?v=20261117-hunt-v1";
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
const state={user:null,snapshot:null,pulse:null,plan:null,goals:[],missions:[],busy:false,day:null,lastFetch:0};
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
 set("huntTarget",photos.ready?fmt(photos.daily):"—");
 set("missionDate",photos.ready?"LIVE OWNER ACTIVITY · "+(state.pulse?.timezone||"ACCOUNT TIME"):"WAITING FOR 7+ COMPLETED DAYS");
 set("huntPhotoStatus",photos.ready?"Today's suggested quota: "+fmt(photos.daily):photos.reason);
 set("huntVideoTarget",videos.ready?fmt(videos.weekly)+" / WK":"—");
 set("huntVideoStatus",videos.ready?"Uploaded this week: "+fmt(p.videoThisWeek)+". "+videos.reason:videos.reason);
 set("huntCatchup",photos.ready?fmt(photos.carryover):"—");
 set("huntCatchupStatus",photos.ready?
  (photos.missedYesterday?"Yesterday had zero photo uploads. ":"No missed-day penalty for today. ")+
  (photos.carryover?"Suggested catch-up photos: "+fmt(photos.carryover)+". ":"No photo carryover. ")+
  (photos.pausedByBacklog?"Review backlog is high. ":""):
  "A reliable baseline is not available yet.");
 const label=photos.ready?fmt(p.photoToday)+" / "+fmt(photos.daily)+" complete":"Baseline not yet established";
 set("huntProgressText",label);
 $("huntProgressFill").style.width=photos.ready?Math.min(100,Math.round(p.photoToday/Math.max(1,photos.daily)*100))+"%":"0%";
 set("huntPacingNote",p.method+" "+p.warning);
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
function draw(){
 const s=state.snapshot;if(!s)return;
 state.plan=state.pulse?planGunnerProduction(state.pulse,s):null;
 state.missions=createMissions(s,state.goals);
 paintFocus(s);renderQuotas();renderBrief();renderMissions();renderSignals();
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
  state.day=day();state.lastFetch=Date.now();draw();
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
  state.user=auth.user;
  $("huntGate").hidden=true;$("huntApp").hidden=false;
  await refresh();
 }catch(error){fail(error.message||error)}
}
$("huntGateRetry").addEventListener("click",()=>void boot());
$("huntRecalculate").addEventListener("click",()=>void refresh());
$("huntOpenMission").addEventListener("click",()=>openMission(0));
$("huntCloseMission").addEventListener("click",()=>{$("huntMissionDetails").hidden=true});
document.addEventListener("visibilitychange",()=>{
 if(!document.hidden&&state.user&&(state.day!==day()||Date.now()-state.lastFetch>180000))void refresh();
});
void boot();